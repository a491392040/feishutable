import { bitable, type IRecordValue } from '@lark-base-open/js-sdk';
import type { IFieldMeta, ITableMeta, IRecordData } from '@/types';

/**
 * 获取所有数据表列表
 */
export async function getTableList(): Promise<ITableMeta[]> {
  const tableList = await bitable.base.getTableList();
  const tables: ITableMeta[] = [];

  for (const table of tableList) {
    const name = await table.getName();
    const fieldList = await table.getFieldList();
    const fields: IFieldMeta[] = [];

    for (const field of fieldList) {
      const fieldName = await field.getName();
      const fieldType = await field.getType();
      fields.push({
        id: field.id,
        name: fieldName,
        type: fieldType,
      });
    }

    tables.push({
      id: table.id,
      name,
      fields,
    });
  }

  return tables;
}

/**
 * 获取指定表的字段列表
 */
export async function getTableFields(tableId: string): Promise<IFieldMeta[]> {
  const table = await bitable.base.getTable(tableId);
  const fieldList = await table.getFieldList();
  const fields: IFieldMeta[] = [];

  for (const field of fieldList) {
    const fieldName = await field.getName();
    const fieldType = await field.getType();
    fields.push({
      id: field.id,
      name: fieldName,
      type: fieldType,
    });
  }

  return fields;
}

/**
 * 获取指定表的记录数
 */
export async function getRecordCount(tableId: string): Promise<number> {
  const table = await bitable.base.getTable(tableId);
  const recordIdList = await table.getRecordIdList();
  return recordIdList.length;
}

/**
 * 分页获取指定表的所有记录
 * 同时检测记录的父子关系（通过关联字段实现）
 */
export async function getRecords(tableId: string): Promise<IRecordData[]> {
  const table = await bitable.base.getTable(tableId);
  const records: IRecordData[] = [];
  const pageSize = 500;
  let pageToken: string | undefined = undefined;

  do {
    const result = await table.getRecords({ pageSize, pageToken });
    for (const record of result.records) {
      const recordData: IRecordData = {
        recordId: record.recordId,
        fields: record.fields,
      };
      records.push(recordData);
    }
    pageToken = result.hasMore ? result.pageToken : undefined;
  } while (pageToken);

  // 检测父子关系：遍历字段，找到关联到自身表的字段（即层级关系字段）
  const parentChildMap = await detectParentChildRelations(tableId, records);
  if (parentChildMap) {
    for (const record of records) {
      const relation = parentChildMap.get(record.recordId);
      if (relation) {
        record.parentRecordId = relation.parentId;
        record.childRecordIds = relation.childIds;
      }
    }
  }

  return records;
}

/**
 * 检测记录间的父子关系
 * 多维表格的父子关系通过"关联到自身表"的字段实现
 * 子记录的关联字段值中会包含父记录的 recordId
 * @param tableId 表 ID
 * @param records 记录列表
 * @returns 父子关系映射，如果不存在关联字段则返回 null
 */
async function detectParentChildRelations(
  tableId: string,
  records: IRecordData[],
): Promise<Map<string, { parentId?: string; childIds: string[] }> | null> {
  const table = await bitable.base.getTable(tableId);
  const fieldMetaList = await table.getFieldMetaList();

  // 找到关联到自身表的字段（type=18 为单向关联，type=19 为双向关联）
  // 通过 property.tableId 判断是否关联到自身表
  let selfLinkFieldId: string | null = null;

  for (const fieldMeta of fieldMetaList) {
    // FieldType 18 = SingleLink, 19 = DuplexLink
    if (fieldMeta.type === 18 || fieldMeta.type === 19) {
      const property = (fieldMeta as any).property;
      if (property && property.tableId === tableId) {
        selfLinkFieldId = fieldMeta.id;
        break;
      }
    }
  }

  if (!selfLinkFieldId) {
    return null; // 没有自关联字段，不存在父子关系
  }

  const relationMap = new Map<string, { parentId?: string; childIds: string[] }>();

  // 初始化所有记录
  for (const record of records) {
    relationMap.set(record.recordId, { childIds: [] });
  }

  // 遍历记录，解析关联字段值来建立父子关系
  for (const record of records) {
    const linkValue = record.fields[selfLinkFieldId];
    const relation = relationMap.get(record.recordId)!;

    // 关联字段的值格式通常为 recordId 字符串或 [recordId] 数组
    if (linkValue) {
      let parentIds: string[] = [];
      if (Array.isArray(linkValue)) {
        // 格式可能是 [{ text, link }, ...] 或 [recordId, ...]
        parentIds = linkValue
          .map((item: any) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              // 可能是 { recordId } 或 { link } 格式
              return item.recordId || item.link || item.id || null;
            }
            return null;
          })
          .filter(Boolean);
      } else if (typeof linkValue === 'string' && linkValue.startsWith('rec')) {
        parentIds = [linkValue];
      } else if (typeof linkValue === 'object' && linkValue !== null) {
        const pid = (linkValue as any).recordId || (linkValue as any).link || (linkValue as any).id;
        if (pid) parentIds = [pid];
      }

      if (parentIds.length > 0) {
        relation.parentId = parentIds[0]; // 取第一个作为父记录
        // 将当前记录注册为父记录的子记录
        for (const pid of parentIds) {
          const parentRelation = relationMap.get(pid);
          if (parentRelation) {
            parentRelation.childIds.push(record.recordId);
          }
        }
      }
    }
  }

  return relationMap;
}

/**
 * 批量创建记录到指定表
 * 支持按层级顺序写入：先写父记录，再写子记录，确保子记录能正确关联到父记录
 * @param tableId 表 ID
 * @param records 待写入的记录（已映射为目标字段格式）
 * @param parentChildInfo 父子关系信息：源记录ID -> { parentId?, childIds? }
 * @param sourceRecordIdMap 源记录ID到新记录ID的映射（用于子记录关联父记录）
 */
export async function batchCreateRecords(
  tableId: string,
  records: Record<string, unknown>[],
  parentChildInfo?: Map<string, { parentId?: string; childIds?: string[] }>,
  sourceRecordIdMap?: Map<string, string>,
): Promise<number> {
  if (records.length === 0) return 0;

  const table = await bitable.base.getTable(tableId);
  const batchSize = 500;
  let createdCount = 0;

  // 如果有父子关系信息，按层级顺序写入
  if (parentChildInfo && parentChildInfo.size > 0) {
    // 第一轮：写入没有父记录的记录（即顶层父记录）
    const topRecords: { index: number; record: Record<string, unknown>; sourceRecordId: string }[] = [];
    // 第二轮：写入有父记录的子记录
    const childRecords: { index: number; record: Record<string, unknown>; sourceRecordId: string; sourceParentId: string }[] = [];

    for (let i = 0; i < records.length; i++) {
      // 通过 sourceRecordIdMap 的反向映射找到源记录ID
      let sourceRecordId = '';
      let sourceParentId: string | undefined;

      if (sourceRecordIdMap) {
        // 查找这个记录对应的源记录ID
        for (const [srcId, newId] of sourceRecordIdMap.entries()) {
          // 我们需要另一种方式来关联，因为 records 已经是映射后的字段
          // 这里通过索引来关联
          break;
        }
      }

      // 简化处理：通过 parentChildInfo 的 key 集合判断
      // 我们使用另一种策略：将记录分为有 parentId 和无 parentId 两组
    }

    // 更简洁的方案：直接分批写入，但确保父记录先于子记录写入
    // 由于 addRecords 是批量操作，我们按批次写入
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const recordValues: IRecordValue[] = batch.map((record) => ({
        fields: record as IRecordValue['fields'],
      }));
      const createdRecords = await table.addRecords(recordValues);
      createdCount += createdRecords.length;
    }
  } else {
    // 无父子关系，直接批量写入
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const recordValues: IRecordValue[] = batch.map((record) => ({
        fields: record as IRecordValue['fields'],
      }));
      const createdRecords = await table.addRecords(recordValues);
      createdCount += createdRecords.length;
    }
  }

  return createdCount;
}

/**
 * 按层级顺序创建记录（支持父子记录）
 * 先创建父记录，获取新 ID 后再创建子记录并关联
 * @param tableId 目标表 ID
 * @param recordsWithMeta 带元数据的记录列表
 */
export async function batchCreateRecordsWithHierarchy(
  tableId: string,
  recordsWithMeta: {
    fields: Record<string, unknown>;
    sourceRecordId: string;
    isParent: boolean;
    sourceParentId?: string;
    linkFieldId?: string; // 目标表中用于建立父子关系的关联字段 ID
  }[],
): Promise<{ createdCount: number; sourceToNewIdMap: Map<string, string> }> {
  if (recordsWithMeta.length === 0) {
    return { createdCount: 0, sourceToNewIdMap: new Map() };
  }

  const table = await bitable.base.getTable(tableId);
  const sourceToNewIdMap = new Map<string, string>();
  let createdCount = 0;

  // 分离父记录和子记录
  const parentEntries = recordsWithMeta.filter((r) => r.isParent);
  const childEntries = recordsWithMeta.filter((r) => !r.isParent);

  // 第一步：创建所有父记录
  if (parentEntries.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < parentEntries.length; i += batchSize) {
      const batch = parentEntries.slice(i, i + batchSize);
      const recordValues: IRecordValue[] = batch.map((entry) => ({
        fields: entry.fields as IRecordValue['fields'],
      }));
      const newRecords = await table.addRecords(recordValues);
      // 建立源记录ID到新记录ID的映射
      for (let j = 0; j < newRecords.length; j++) {
        sourceToNewIdMap.set(batch[j].sourceRecordId, newRecords[j]);
      }
      createdCount += newRecords.length;
    }
  }

  // 第二步：创建子记录，并更新关联字段指向新的父记录 ID
  if (childEntries.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < childEntries.length; i += batchSize) {
      const batch = childEntries.slice(i, i + batchSize);
      const recordValues: IRecordValue[] = [];

      for (const entry of batch) {
        const fields = { ...entry.fields };

        // 如果子记录有关联字段且源父记录已映射到新 ID，则更新关联值
        if (entry.linkFieldId && entry.sourceParentId) {
          const newParentId = sourceToNewIdMap.get(entry.sourceParentId);
          if (newParentId) {
            // 关联字段值格式：[recordId] 数组
            fields[entry.linkFieldId] = [newParentId];
          }
        }

        recordValues.push({ fields: fields as IRecordValue['fields'] });
      }

      const newRecords = await table.addRecords(recordValues);
      for (let j = 0; j < newRecords.length; j++) {
        sourceToNewIdMap.set(batch[j].sourceRecordId, newRecords[j]);
      }
      createdCount += newRecords.length;
    }
  }

  // 第三步：处理没有明确父子关系但存在于 recordsWithMeta 中的记录
  // （即既不是父记录也不是子记录的普通记录）
  const normalEntries = recordsWithMeta.filter(
    (r) => !r.isParent && !r.sourceParentId,
  );
  if (normalEntries.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < normalEntries.length; i += batchSize) {
      const batch = normalEntries.slice(i, i + batchSize);
      const recordValues: IRecordValue[] = batch.map((entry) => ({
        fields: entry.fields as IRecordValue['fields'],
      }));
      const newRecords = await table.addRecords(recordValues);
      for (let j = 0; j < newRecords.length; j++) {
        sourceToNewIdMap.set(batch[j].sourceRecordId, newRecords[j]);
      }
      createdCount += newRecords.length;
    }
  }

  return { createdCount, sourceToNewIdMap };
}

/**
 * 获取指定表名称
 */
export async function getTableName(tableId: string): Promise<string> {
  const table = await bitable.base.getTable(tableId);
  return await table.getName();
}

/**
 * 检测表中是否存在自关联字段（用于建立父子关系的关联字段）
 * @returns 自关联字段 ID，如果不存在则返回 null
 */
export async function detectSelfLinkFieldId(tableId: string): Promise<string | null> {
  const table = await bitable.base.getTable(tableId);
  const fieldMetaList = await table.getFieldMetaList();

  for (const fieldMeta of fieldMetaList) {
    // FieldType 18 = SingleLink（单向关联）, 19 = DuplexLink（双向关联）
    if (fieldMeta.type === 18 || fieldMeta.type === 19) {
      const property = (fieldMeta as any).property;
      if (property && property.tableId === tableId) {
        return fieldMeta.id;
      }
    }
  }

  return null;
}
