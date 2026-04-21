import { bitable, type IRecordValue } from '@lark-base-open/js-sdk';
import type { IFieldMeta, ITableMeta, IRecordData } from '@/types';

/** 调试日志收集器 */
export const debugLogs: string[] = [];
function debugLog(msg: string) {
  debugLogs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  console.log('[Debug]', msg);
}
/** 获取并清空调试日志 */
export function getDebugLogs(): string[] {
  const logs = [...debugLogs];
  debugLogs.length = 0;
  return logs;
}

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
 * 方式5验证有效：在 addRecord 的 fields 中直接传入 IOpenLink 对象
 * 策略：先批量添加父记录，再批量添加子记录（子记录的关联字段直接包含 IOpenLink 值）
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

  debugLog(`[Hierarchy] 总记录: ${recordsWithMeta.length}, 父记录: ${parentEntries.length}, 子记录: ${childEntries.length}`);
  if (parentEntries.length > 0) {
    debugLog(`[Hierarchy] 父记录示例: ${JSON.stringify(parentEntries[0].fields).slice(0, 300)}`);
  }
  if (childEntries.length > 0) {
    debugLog(`[Hierarchy] 子记录示例: ${JSON.stringify(childEntries[0].fields).slice(0, 300)}`);
  }

  // ============================================
  // 第一步：创建所有父记录
  // ============================================
  if (parentEntries.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < parentEntries.length; i += batchSize) {
      const batch = parentEntries.slice(i, i + batchSize);
      const recordValues: IRecordValue[] = batch.map((entry) => ({
        fields: entry.fields as IRecordValue['fields'],
      }));
      const newRecordIds = await table.addRecords(recordValues);
      debugLog(`[Hierarchy] 父记录创建成功: ${newRecordIds.length} 条, IDs: ${newRecordIds.join(',')}`);
      for (let j = 0; j < newRecordIds.length; j++) {
        sourceToNewIdMap.set(batch[j].sourceRecordId, newRecordIds[j]);
      }
      createdCount += newRecordIds.length;
    }
  }

  // ============================================
  // 第二步：创建所有子记录（关联字段直接用 IOpenLink 格式）
  // ============================================
  if (childEntries.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < childEntries.length; i += batchSize) {
      const batch = childEntries.slice(i, i + batchSize);
      const recordValues: IRecordValue[] = [];

      for (const entry of batch) {
        const fields = { ...entry.fields };

        // 如果有父记录且父记录已成功添加，直接在 fields 中设置 IOpenLink 关联值
        if (entry.linkFieldId && entry.sourceParentId) {
          const newParentId = sourceToNewIdMap.get(entry.sourceParentId);
          if (newParentId) {
            fields[entry.linkFieldId] = {
              text: '',
              type: 'text',
              recordIds: [newParentId],
              tableId: tableId,
            };
            debugLog(`[Hierarchy] 子记录 ${entry.sourceRecordId} -> 关联父记录 ${newParentId}`);
          } else {
            debugLog(`[Hierarchy] 子记录 ${entry.sourceRecordId} -> 父记录 ${entry.sourceParentId} 未找到映射，跳过关联`);
          }
        }

        recordValues.push({ fields: fields as IRecordValue['fields'] });
      }

      const newRecordIds = await table.addRecords(recordValues);
      for (let j = 0; j < newRecordIds.length; j++) {
        sourceToNewIdMap.set(batch[j].sourceRecordId, newRecordIds[j]);
      }
      createdCount += newRecordIds.length;
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
