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
export async function getRecords(
  tableId: string,
  onProgress?: (loaded: number) => void,
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

  onProgress?.(records.length);
  return records;
}

/**
 * 检测记录间的父子关系
 * 策略：扫描记录数据中所有字段值，找到包含 IOpenLink 格式且 tableId 指向自身的字段
 */
async function detectParentChildRelations(
  tableId: string,
  records: IRecordData[],
): Promise<Map<string, { parentId?: string; childIds: string[] }> | null> {
  if (records.length === 0) return null;

  // 第一步：通过扫描记录数据发现自关联字段
  let selfLinkFieldId: string | null = null;

  // 只扫描前 100 条记录来发现自关联字段（不需要扫全部）
  const scanLimit = Math.min(records.length, 100);
  for (let i = 0; i < scanLimit; i++) {
    const record = records[i];
    for (const [fieldId, value] of Object.entries(record.fields)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const v = value as any;
        if ((v.recordIds || v.record_ids) && v.tableId) {
          const ids = v.recordIds || v.record_ids || [];
          if (Array.isArray(ids) && ids.length > 0 && v.tableId === tableId) {
            selfLinkFieldId = fieldId;
            debugLog(`通过数据扫描发现自关联字段: ${fieldId} (tableId=${v.tableId})`);
            break;
          }
        }
      }
    }
    if (selfLinkFieldId) break;
  }

  // 第二步：如果数据扫描没找到，尝试通过字段元数据查找
  if (!selfLinkFieldId) {
    try {
      const table = await bitable.base.getTable(tableId);
      const fieldMetaList = await table.getFieldMetaList();
      for (const fieldMeta of fieldMetaList) {
        if (fieldMeta.type === 18 || fieldMeta.type === 19) {
          const property = (fieldMeta as any).property;
          if (property && property.tableId === tableId) {
            selfLinkFieldId = fieldMeta.id;
            debugLog(`通过字段元数据发现自关联字段: ${fieldMeta.name}(ID:${fieldMeta.id})`);
            break;
          }
        }
      }
    } catch (e: any) {
      debugLog(`字段元数据查找失败: ${e.message}`);
    }
  }

  debugLog(`最终 selfLinkFieldId = ${selfLinkFieldId}`);

  if (!selfLinkFieldId) return null;

  // 第三步：构建父子关系映射
  const relationMap = new Map<string, { parentId?: string; childIds: string[] }>();
  for (const record of records) {
    relationMap.set(record.recordId, { childIds: [] });
  }

  for (const record of records) {
    const linkValue = record.fields[selfLinkFieldId];
    const relation = relationMap.get(record.recordId)!;

    if (linkValue && typeof linkValue === 'object' && !Array.isArray(linkValue)) {
      const v = linkValue as any;
      const parentIds: string[] = v.recordIds || v.record_ids || [];

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

  // 已知不支持写入的字段 ID 集合（跨批次累积）
  const unsupportedFieldIds = new Set<string>();

  for (let i = 0; i < records.length; i += batchSize) {
    let batch = records.slice(i, i + batchSize);

    // 过滤掉已知不支持的字段
    if (unsupportedFieldIds.size > 0) {
      batch = batch.map((record) => {
        const filtered: Record<string, unknown> = {};
        for (const [fieldId, value] of Object.entries(record)) {
          if (!unsupportedFieldIds.has(fieldId)) {
            filtered[fieldId] = value;
          }
        }
        return filtered;
      });
    }

    const recordValues: IRecordValue[] = batch.map((record) => ({
      fields: record as IRecordValue['fields'],
    }));

    try {
      const createdRecords = await table.addRecords(recordValues);
      createdCount += createdRecords.length;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('not support')) {
        // 尝试逐字段排除法：用第一条记录试探哪个字段不支持
        if (batch.length > 0) {
          const sampleRecord = batch[0];
          const fieldIds = Object.keys(sampleRecord);
          debugLog(`[写入] 检测到不支持的字段，开始逐字段排除 (${fieldIds.length} 个字段)`);

          // 二分排除法
          await excludeUnsupportedFields(
            table, sampleRecord, fieldIds, unsupportedFieldIds,
          );
          debugLog(`[写入] 已识别不支持的字段: ${Array.from(unsupportedFieldIds).join(', ')}`);

          // 重新过滤并写入
          const filteredBatch = batch.map((record) => {
            const filtered: Record<string, unknown> = {};
            for (const [fieldId, value] of Object.entries(record)) {
              if (!unsupportedFieldIds.has(fieldId)) {
                filtered[fieldId] = value;
              }
            }
            return filtered;
          });
          const filteredRecordValues: IRecordValue[] = filteredBatch.map((record) => ({
            fields: record as IRecordValue['fields'],
          }));
          const createdRecords = await table.addRecords(filteredRecordValues);
          createdCount += createdRecords.length;
        }
      } else {
        throw err;
      }
    }

    // 每批写入后让出主线程，避免 UI 冻结
    onProgress?.(createdCount);
    await sleep(50);
  }

  return createdCount;
}

/**
 * 二分排除法：找出不支持写入的字段
 * 用一条记录试探写入，逐步排除字段直到成功
 */
async function excludeUnsupportedFields(
  table: any,
  sampleRecord: Record<string, unknown>,
  fieldIds: string[],
  unsupportedFieldIds: Set<string>,
): Promise<void> {
  // 先检查是否还有未排除的字段
  const remainingFieldIds = fieldIds.filter((id) => !unsupportedFieldIds.has(id));
  if (remainingFieldIds.length === 0) return;

  // 尝试用所有剩余字段写入
  const testFields: Record<string, unknown> = {};
  for (const fieldId of remainingFieldIds) {
    testFields[fieldId] = sampleRecord[fieldId];
  }

  try {
    await table.addRecords([{ fields: testFields as any }]);
    // 成功，说明所有剩余字段都支持
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (!errMsg.includes('not support')) throw err;

    // 二分排除
    if (remainingFieldIds.length === 1) {
      // 只剩一个字段，就是它不支持
      unsupportedFieldIds.add(remainingFieldIds[0]);
      debugLog(`[写入] 不支持的字段: ${remainingFieldIds[0]}`);
      return;
    }

    // 分成两半，递归检查
    const mid = Math.ceil(remainingFieldIds.length / 2);
    const firstHalf = remainingFieldIds.slice(0, mid);
    const secondHalf = remainingFieldIds.slice(mid);

    // 检查前半部分
    const firstFields: Record<string, unknown> = {};
    for (const fieldId of firstHalf) {
      if (!unsupportedFieldIds.has(fieldId)) {
        firstFields[fieldId] = sampleRecord[fieldId];
      }
    }
    try {
      await table.addRecords([{ fields: firstFields as any }]);
    } catch (e: any) {
      if ((e?.message || String(e)).includes('not support')) {
        await excludeUnsupportedFields(table, sampleRecord, firstHalf, unsupportedFieldIds);
      }
    }

    // 检查后半部分
    const secondFields: Record<string, unknown> = {};
    for (const fieldId of secondHalf) {
      if (!unsupportedFieldIds.has(fieldId)) {
        secondFields[fieldId] = sampleRecord[fieldId];
      }
    }
    try {
      await table.addRecords([{ fields: secondFields as any }]);
    } catch (e: any) {
      if ((e?.message || String(e)).includes('not support')) {
        await excludeUnsupportedFields(table, sampleRecord, secondHalf, unsupportedFieldIds);
      }
    }
  }
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
