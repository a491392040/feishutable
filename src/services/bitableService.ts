import { bitable, type IRecordValue } from '@lark-base-open/js-sdk';
import type { IFieldMeta, ITableMeta, IRecordData } from '@/types';

/** 调试日志收集器 */
export const debugLogs: string[] = [];
export function debugLog(msg: string) {
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
 * 不支持写入的字段类型（基于 @lark-base-open/js-sdk FieldType 枚举）
 */
const UNSUPPORTED_WRITE_FIELD_TYPES = new Set([
  0,    // NotSupport
  19,   // Lookup（查找引用，只读）
  20,   // Formula（公式，只读）
  403,  // Denied
  1001, // CreatedTime（创建时间，只读）
  1002, // ModifiedTime（修改时间，只读）
  1003, // CreatedUser（创建人，只读）
  1004, // ModifiedUser（修改人，只读）
  1005, // AutoNumber（自动编号，只读）
]);

/**
 * 过滤掉不支持写入的字段
 */
export function filterUnsupportedFields(
  fields: Record<string, unknown>,
  fieldMetas: IFieldMeta[],
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [fieldId, value] of Object.entries(fields)) {
    const fieldMeta = fieldMetas.find((f) => f.id === fieldId);
    if (fieldMeta && UNSUPPORTED_WRITE_FIELD_TYPES.has(fieldMeta.type)) {
      debugLog(`[过滤] 跳过只读字段 "${fieldMeta.name}" (type=${fieldMeta.type})`);
      continue;
    }
    filtered[fieldId] = value;
  }
  return filtered;
}

/**
 * 让出主线程，避免浏览器判定页面无响应
 * @param ms 等待毫秒数（默认 0，仅让出事件循环）
 */
export function sleep(ms: number = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * @param onProgress 进度回调（可选），参数为已加载记录数
 */
/**
 * 获取表的所有记录
 * @param tableId 表 ID
 * @param onProgress 进度回调
 * @param allRecordIds 可选：所有源表的 recordId 集合，用于跨表关联检测。如果不传，则跳过父子关系检测
 */
export async function getRecords(
  tableId: string,
  onProgress?: (loaded: number) => void,
  allRecordIds?: Set<string>,
): Promise<IRecordData[]> {
  const table = await bitable.base.getTable(tableId);
  const records: IRecordData[] = [];
  const pageSize = 500;
  let pageToken: string | undefined = undefined;
  let pageCount = 0;

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
    pageCount++;

    // 每页加载后让出主线程，避免大数据量时 UI 冻结
    if (pageCount % 2 === 0) {
      onProgress?.(records.length);
      await sleep(0);
    }
  } while (pageToken);

  // 检测父子关系（传入所有源表的 recordId 集合用于跨表关联检测）
  const parentChildMap = await detectParentChildRelations(tableId, records, allRecordIds);
  if (parentChildMap) {
    for (const record of records) {
      const relation = parentChildMap.get(record.recordId);
      if (relation) {
        record.parentRecordId = relation.parentId;
        record.childRecordIds = relation.childIds;
      }
    }
  }

  onProgress?.(records.length);
  return records;
}

/**
 * 检测记录间的父子关系
 * 策略：扫描记录数据中所有字段值，找到包含关联格式（recordIds）的字段，
 * 如果 recordIds 指向当前表或跨表中的记录，则认为是父子关系
 * @param tableId 当前表 ID
 * @param records 当前表的记录
 * @param externalRecordIds 可选：其他表的 recordId 集合，用于跨表关联检测
 */
export async function detectParentChildRelations(
  tableId: string,
  records: IRecordData[],
  externalRecordIds?: Set<string>,
): Promise<Map<string, { parentId?: string; childIds: string[] }> | null> {
  if (records.length === 0) return null;

  // 收集当前表所有 recordId，用于判断关联是否指向当前表
  const currentTableRecordIds = new Set(records.map((r) => r.recordId));
  // 合并外部 recordId（用于跨表关联检测）
  const allKnownRecordIds = externalRecordIds || currentTableRecordIds;

  // 第一步：通过扫描记录数据发现关联字段
  let linkFieldId: string | null = null;

  // 只扫描前 100 条记录来发现关联字段
  const scanLimit = Math.min(records.length, 100);
  for (let i = 0; i < scanLimit; i++) {
    const record = records[i];
    for (const [fieldId, value] of Object.entries(record.fields)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const v = value as any;
        debugLog(`[关联检测] 字段 ${fieldId} 值类型: object, keys=${Object.keys(v).join(',')}, 值=${JSON.stringify(v).substring(0, 200)}`);
        if ((v.recordIds || v.record_ids)) {
          const ids: string[] = v.recordIds || v.record_ids || [];
          if (Array.isArray(ids) && ids.length > 0) {
            // 检查是否有关联值指向已知记录（当前表或跨表）
            const hasSelfRef = ids.some((id: string) => allKnownRecordIds.has(id));
            if (hasSelfRef) {
              linkFieldId = fieldId;
              debugLog(`通过数据扫描发现关联字段: ${fieldId} (tableId=${v.tableId || '跨表'})`);
              break;
            }
          }
        }
      } else if (value && Array.isArray(value)) {
        // 检查数组格式（某些关联字段可能是数组）
        debugLog(`[关联检测] 字段 ${fieldId} 值类型: array, 长度=${value.length}, 第一项=${JSON.stringify(value[0]).substring(0, 200)}`);
      }
    }
    if (linkFieldId) break;
  }

  // 第二步：如果数据扫描没找到，尝试通过字段元数据查找
  if (!linkFieldId) {
    try {
      const table = await bitable.base.getTable(tableId);
      const fieldMetaList = await table.getFieldMetaList();
      for (const fieldMeta of fieldMetaList) {
        if (fieldMeta.type === 18 || fieldMeta.type === 19) {
          // 双向关联(18)或单向关联(17)字段
          linkFieldId = fieldMeta.id;
          debugLog(`通过字段元数据发现关联字段: ${fieldMeta.name}(ID:${fieldMeta.id})`);
          break;
        }
      }
    } catch (e: any) {
      debugLog(`字段元数据查找失败: ${e.message}`);
    }
  }

  debugLog(`最终 linkFieldId = ${linkFieldId}`);

  if (!linkFieldId) return null;

  // 第三步：构建父子关系映射
  const relationMap = new Map<string, { parentId?: string; childIds: string[] }>();
  for (const record of records) {
    relationMap.set(record.recordId, { childIds: [] });
  }

  for (const record of records) {
    const linkValue = record.fields[linkFieldId];
    const relation = relationMap.get(record.recordId)!;

    if (linkValue && typeof linkValue === 'object' && !Array.isArray(linkValue)) {
      const v = linkValue as any;
      const parentIds: string[] = v.recordIds || v.record_ids || [];

      if (parentIds.length > 0) {
        // 只取指向已知记录的 ID 作为父记录（当前表或跨表）
        const validParentIds = parentIds.filter((id: string) => allKnownRecordIds.has(id));
        if (validParentIds.length > 0) {
          relation.parentId = validParentIds[0];
          for (const pid of validParentIds) {
            const parentRelation = relationMap.get(pid);
            if (parentRelation) {
              parentRelation.childIds.push(record.recordId);
            }
          }
        }
      }
    }
  }

  return relationMap;
}

/**
 * 批量删除记录
 */
export async function batchDeleteRecords(
  tableId: string,
  recordIds: string[],
): Promise<void> {
  if (recordIds.length === 0) return;

  const table = await bitable.base.getTable(tableId);
  const batchSize = 500;

  for (let i = 0; i < recordIds.length; i += batchSize) {
    const batch = recordIds.slice(i, i + batchSize);
    await table.deleteRecords(batch);
    debugLog(`[删除] 已删除 ${batch.length} 条记录`);
    await sleep(50);
  }
}

/**
 * 批量创建记录到指定表（无父子关系时使用）
 * @param onProgress 进度回调（可选），参数为已创建记录数
 */
export async function batchCreateRecords(
  tableId: string,
  records: Record<string, unknown>[],
  onProgress?: (created: number) => void,
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

    onProgress?.(createdCount);
    await sleep(50);
  }

  return createdCount;
}

/**
 * 按层级顺序创建记录（支持父子记录）
 * @param onProgress 进度回调（可选），参数为已创建记录数
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
  onProgress?: (created: number) => void,
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
      for (let j = 0; j < newRecordIds.length; j++) {
        sourceToNewIdMap.set(batch[j].sourceRecordId, newRecordIds[j]);
      }
      createdCount += newRecordIds.length;

      // 每批写入后让出主线程
      onProgress?.(createdCount);
      await sleep(50);
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

        if (entry.linkFieldId && entry.sourceParentId) {
          const newParentId = sourceToNewIdMap.get(entry.sourceParentId);
          if (newParentId) {
            fields[entry.linkFieldId] = {
              text: '',
              type: 'text',
              recordIds: [newParentId],
              tableId: tableId,
            };
          }
        }

        recordValues.push({ fields: fields as IRecordValue['fields'] });
      }

      const newRecordIds = await table.addRecords(recordValues);
      for (let j = 0; j < newRecordIds.length; j++) {
        sourceToNewIdMap.set(batch[j].sourceRecordId, newRecordIds[j]);
      }
      createdCount += newRecordIds.length;

      // 每批写入后让出主线程
      onProgress?.(createdCount);
      await sleep(50);
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
