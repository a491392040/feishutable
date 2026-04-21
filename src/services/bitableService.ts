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

  // 检测父子关系
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
 */
async function detectParentChildRelations(
  tableId: string,
  records: IRecordData[],
): Promise<Map<string, { parentId?: string; childIds: string[] }> | null> {
  const table = await bitable.base.getTable(tableId);
  const fieldMetaList = await table.getFieldMetaList();

  let selfLinkFieldId: string | null = null;
  for (const fieldMeta of fieldMetaList) {
    if (fieldMeta.type === 18 || fieldMeta.type === 19) {
      const property = (fieldMeta as any).property;
      if (property && property.tableId === tableId) {
        selfLinkFieldId = fieldMeta.id;
        break;
      }
    }
  }

  if (!selfLinkFieldId) return null;

  const relationMap = new Map<string, { parentId?: string; childIds: string[] }>();
  for (const record of records) {
    relationMap.set(record.recordId, { childIds: [] });
  }

  for (const record of records) {
    const linkValue = record.fields[selfLinkFieldId];
    const relation = relationMap.get(record.recordId)!;

    if (linkValue) {
      let parentIds: string[] = [];
      if (Array.isArray(linkValue)) {
        parentIds = linkValue
          .map((item: any) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
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
        relation.parentId = parentIds[0];
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
 * 批量创建记录到指定表（无父子关系时使用）
 */
export async function batchCreateRecords(
  tableId: string,
  records: Record<string, unknown>[],
): Promise<number> {
  if (records.length === 0) return 0;

  const table = await bitable.base.getTable(tableId);
  const batchSize = 500;
  let createdCount = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const recordValues: IRecordValue[] = batch.map((record) => ({
      fields: record as IRecordValue['fields'],
    }));
    const createdRecords = await table.addRecords(recordValues);
    createdCount += createdRecords.length;
  }

  return createdCount;
}

/**
 * 按层级顺序创建记录（支持父子记录）
 * 策略：先添加父记录，再添加子记录，最后用 setCellValue 设置关联
 */
export async function batchCreateRecordsWithHierarchy(
  tableId: string,
  recordsWithMeta: {
    fields: Record<string, unknown>;
    sourceRecordId: string;
    isParent: boolean;
    sourceParentId?: string;
    linkFieldId?: string;
  }[],
): Promise<{ createdCount: number; sourceToNewIdMap: Map<string, string> }> {
  if (recordsWithMeta.length === 0) {
    return { createdCount: 0, sourceToNewIdMap: new Map() };
  }

  const table = await bitable.base.getTable(tableId);
  const sourceToNewIdMap = new Map<string, string>();
  let createdCount = 0;

  // 分离：父记录（无 parentRecordId）、子记录（有 parentRecordId）
  const parentEntries = recordsWithMeta.filter((r) => r.isParent);
  const childEntries = recordsWithMeta.filter((r) => !r.isParent && r.sourceParentId);

  // ============================================
  // 第一步：创建所有父记录（直接添加）
  // ============================================
  if (parentEntries.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < parentEntries.length; i += batchSize) {
      const batch = parentEntries.slice(i, i + batchSize);
      const recordValues: IRecordValue[] = batch.map((entry) => ({
        fields: entry.fields as IRecordValue['fields'],
      }));
      const newRecordIds = await table.addRecords(recordValues);
      for (let j = 0; j < newRecordIds.length; j++) {
        sourceToNewIdMap.set(batch[j].sourceRecordId, newRecordIds[j]);
      }
      createdCount += newRecordIds.length;
    }
  }

  // ============================================
  // 第二步：创建子记录并设置关联
  // ============================================
  if (childEntries.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < childEntries.length; i += batchSize) {
      const batch = childEntries.slice(i, i + batchSize);

      // 2.1 先批量添加子记录（不包含关联字段值）
      const recordValues: IRecordValue[] = batch.map((entry) => {
        const fields = { ...entry.fields };
        if (entry.linkFieldId) {
          delete fields[entry.linkFieldId];
        }
        return { fields: fields as IRecordValue['fields'] };
      });

      const newRecordIds = await table.addRecords(recordValues);

      // 2.2 建立源记录ID到新记录ID的映射
      for (let j = 0; j < newRecordIds.length; j++) {
        sourceToNewIdMap.set(batch[j].sourceRecordId, newRecordIds[j]);
      }
      createdCount += newRecordIds.length;

      // 2.3 逐条用 setCellValue 设置关联字段
      for (let k = 0; k < batch.length; k++) {
        const entry = batch[k];
        if (!entry.linkFieldId || !entry.sourceParentId) continue;

        const newChildId = sourceToNewIdMap.get(entry.sourceRecordId);
        const newParentId = sourceToNewIdMap.get(entry.sourceParentId);

        // 只有父记录已成功添加时，才设置关联
        if (newChildId && newParentId) {
          try {
            await table.setCellValue(entry.linkFieldId, newChildId, {
              text: '',
              type: 'text',
              recordIds: [newParentId],
              tableId: tableId,
            } as any);
          } catch (err) {
            console.error(`设置关联失败: 子=${newChildId}, 父=${newParentId}`, err);
          }
        }
      }
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
 * 检测表中是否存在自关联字段
 */
export async function detectSelfLinkFieldId(tableId: string): Promise<string | null> {
  const table = await bitable.base.getTable(tableId);
  const fieldMetaList = await table.getFieldMetaList();

  for (const fieldMeta of fieldMetaList) {
    if (fieldMeta.type === 18 || fieldMeta.type === 19) {
      const property = (fieldMeta as any).property;
      if (property && property.tableId === tableId) {
        return fieldMeta.id;
      }
    }
  }

  return null;
}

/**
 * 确保目标表有自关联字段，如果没有则自动创建
 */
export async function ensureSelfLinkField(tableId: string): Promise<string> {
  const existingFieldId = await detectSelfLinkFieldId(tableId);
  if (existingFieldId) {
    return existingFieldId;
  }

  const table = await bitable.base.getTable(tableId);
  const fieldName = '父记录关联';

  const fieldId = await table.addField({
    type: 18 as any,
    name: fieldName,
    property: {
      multiple: false,
      tableId: tableId,
    },
  });

  return fieldId;
}
