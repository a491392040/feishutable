import type {
  IRecordData,
  IFieldMapping,
  IDedupConfig,
  ISplitConfig,
  IMergeConfig,
  IPreviewRecord,
} from '@/types';
import { debugLog } from '@/services/bitableService';

/**
 * 根据去重配置生成记录的唯一键
 * @param record 记录数据
 * @param config 去重配置
 * @param mappings 字段映射
 * @param isSourceRecord 是否为源表记录（源记录用 sourceFieldId 取值，目标记录用 targetFieldId 取值）
 */
export function generateRecordKey(
  record: IRecordData,
  config: IDedupConfig,
  mappings: IFieldMapping[],
  isSourceRecord: boolean = true,
): string {
  if (!config.enabled) {
    // 未启用去重时，使用记录 ID 作为唯一标识
    return record.recordId;
  }

  if (config.mode === 'all_fields') {
    // 全字段模式：使用所有映射字段的值生成键
    const keyObj: Record<string, unknown> = {};
    for (const mapping of mappings) {
      // 源记录用 sourceFieldId 取值，目标记录用 targetFieldId 取值
      const fieldId = isSourceRecord ? mapping.sourceFieldId : mapping.targetFieldId;
      // 统一处理：缺失字段当作 null，确保源记录和目标记录的 key 一致
      const value = record.fields[fieldId];
      keyObj[mapping.targetFieldId] = value !== undefined ? value : null;
    }
    return JSON.stringify(keyObj);
  }

  // 指定字段模式：仅使用指定字段的值生成键
  const keyObj: Record<string, unknown> = {};
  for (const mapping of mappings) {
    if (config.dedupFields.includes(mapping.targetFieldId)) {
      const fieldId = isSourceRecord ? mapping.sourceFieldId : mapping.targetFieldId;
      const value = record.fields[fieldId];
      keyObj[mapping.targetFieldId] = value !== undefined ? value : null;
    }
  }
  const key = JSON.stringify(keyObj);
  debugLog(`[generateRecordKey] isSource=${isSourceRecord}, dedupFields=${config.dedupFields.join(',')}, key=${key.slice(0, 100)}`);
  return key;
}

/**
 * 判断值是否为空（undefined、null、空字符串）
 */
function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * 按映射关系转换源记录字段为目标字段格式
 * 支持默认值：当源字段值为空时使用映射配置中的 defaultValue
 */
export function mapRecordFields(
  sourceRecord: IRecordData,
  config: IMergeConfig,
): Record<string, unknown> {
  const mappedFields: Record<string, unknown> = {};

  for (const mapping of config.fieldMappings) {
    const sourceValue = sourceRecord.fields[mapping.sourceFieldId];

    if (!isEmptyValue(sourceValue)) {
      // 源值不为空，直接使用
      mappedFields[mapping.targetFieldId] = sourceValue;
    } else if (mapping.defaultValue !== undefined && mapping.defaultValue !== '') {
      // 源值为空但有默认值，使用默认值
      mappedFields[mapping.targetFieldId] = mapping.defaultValue;
    }
    // 源值为空且无默认值，不写入该字段（保持 undefined）
  }

  return mappedFields;
}

/**
 * 对记录进行去重处理
 * @returns 包含 toMerge（待合并）、toSkip（待跳过）、toDeleteIds（需删除的目标记录ID）的记录数组
 */
export function deduplicateRecords(
  sourceRecords: IRecordData[],
  existingRecords: IRecordData[],
  config: IMergeConfig,
): { toMerge: IRecordData[]; toSkip: IRecordData[]; toDeleteIds: string[] } {
  if (!config.dedupConfig.enabled) {
    // 未启用去重，所有记录都合并
    return { toMerge: [...sourceRecords], toSkip: [], toDeleteIds: [] };
  }

  // 构建目标表中已有记录的键 → recordId 映射
  // 关键修复：目标记录的 fields key 是目标字段 ID，所以 isSourceRecord = false
  const existingKeyToId = new Map<string, string>();
  for (const record of existingRecords) {
    const key = generateRecordKey(record, config.dedupConfig, config.fieldMappings, false);
    existingKeyToId.set(key, record.recordId);
  }
  debugLog(`[去重] 目标+已合并记录数: ${existingRecords.length}, 去重模式: ${config.dedupConfig.mode}, 策略: ${config.dedupConfig.strategy}`);
  debugLog(`[去重] 去重字段: ${config.dedupConfig.dedupFields.join(', ')}`);
  debugLog(`[去重] existingKeyToId 大小: ${existingKeyToId.size}`);
  if (existingKeyToId.size > 0) {
    const sampleKeys = Array.from(existingKeyToId.entries()).slice(0, 3);
    debugLog(`[去重] 目标表 key 样例: ${sampleKeys.map(([k, id]) => `${k.slice(0, 50)}->${id}`).join(' | ')}`);
  }

  // 同时构建源记录自身的键集合（用于源表内去重）
  const sourceKeys = new Set<string>();

  const toMerge: IRecordData[] = [];
  const toSkip: IRecordData[] = [];
  const toDeleteIds: string[] = [];

  for (const sourceRecord of sourceRecords) {
    // 源记录用 sourceFieldId 取值
    const key = generateRecordKey(sourceRecord, config.dedupConfig, config.fieldMappings, true);
    const hitExisting = existingKeyToId.has(key);
    const hitSource = sourceKeys.has(key);

    if (hitExisting || hitSource) {
      // 与目标表重复 或 与前面已处理的源记录重复
      debugLog(`[去重] 跳过 ${sourceRecord.recordId} (命中${hitExisting ? '目标' : '源表'}), key=${key.slice(0, 150)}`);
      if (config.dedupConfig.strategy === 'overwrite') {
        toMerge.push(sourceRecord);
        // 如果命中目标表记录，记录需要删除的目标记录 ID
        if (hitExisting) {
          const existingId = existingKeyToId.get(key);
          if (existingId) toDeleteIds.push(existingId);
        }
      } else {
        toSkip.push(sourceRecord);
      }
    } else {
      debugLog(`[去重] 保留 ${sourceRecord.recordId}, key=${key.slice(0, 150)}`);
      toMerge.push(sourceRecord);
    }

    // 将当前源记录的 key 加入集合（防止源表内重复）
    sourceKeys.add(key);
  }

  return { toMerge, toSkip, toDeleteIds };
}

/**
 * 从字段值中提取纯文本
 * 支持富文本格式 [{"type":"text","text":"xxx"}] 和普通字符串
 */
function extractPlainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    // 富文本格式：[{type:"text",text:"xxx"}, ...]
    return value
      .filter((item: any) => item && item.type === 'text' && typeof item.text === 'string')
      .map((item: any) => item.text)
      .join('');
  }
  if (value && typeof value === 'object') {
    const obj = value as any;
    if (typeof obj.text === 'string') return obj.text;
  }
  return String(value ?? '');
}

/**
 * 将纯文本字符串转为富文本格式
 */
function toRichText(text: string): unknown[] {
  if (!text) return [];
  return [{ type: 'text', text }];
}

/**
 * 将一条映射后的记录按拆分配置拆分为多条记录
 * 主字段值按分隔符拆分，同步拆分字段一一对应拆分
 * 支持富文本格式字段值
 */
export function splitRecord(
  mappedFields: Record<string, unknown>,
  config: ISplitConfig,
): Record<string, unknown>[] {
  if (!config.enabled || !config.separator) {
    return [mappedFields];
  }

  const primaryValue = mappedFields[config.primaryFieldId];
  if (primaryValue === undefined || primaryValue === null || primaryValue === '') {
    return [mappedFields];
  }

  // 提取纯文本进行拆分
  const primaryText = extractPlainText(primaryValue);
  const primaryParts = primaryText.split(config.separator);
  if (primaryParts.length <= 1) {
    return [mappedFields];
  }

  // 拆分同步字段
  const syncPartsMap = new Map<string, string[]>();
  for (const syncFieldId of config.syncFieldIds) {
    const syncValue = mappedFields[syncFieldId];
    if (syncValue !== undefined && syncValue !== null && syncValue !== '') {
      const syncText = extractPlainText(syncValue);
      syncPartsMap.set(syncFieldId, syncText.split(config.separator));
    }
  }

  const result: Record<string, unknown>[] = [];
  for (let i = 0; i < primaryParts.length; i++) {
    const record = { ...mappedFields };
    // 判断原值是否为富文本格式，保持格式一致
    const isRichText = Array.isArray(primaryValue);
    record[config.primaryFieldId] = isRichText
      ? toRichText(primaryParts[i].trim())
      : primaryParts[i].trim();

    // 同步拆分字段
    for (const [fieldId, parts] of syncPartsMap) {
      const syncValue = mappedFields[fieldId];
      const isSyncRichText = Array.isArray(syncValue);
      record[fieldId] = isSyncRichText
        ? toRichText(i < parts.length ? parts[i].trim() : '')
        : (i < parts.length ? parts[i].trim() : '');
    }

    result.push(record);
  }

  return result;
}

/**
 * 合并数据
 * @param sourceRecords 源表记录
 * @param targetRecords 目标表记录
 * @param config 合并配置
 * @returns 待合并的记录、待跳过的记录、需删除的目标记录ID
 */
export function mergeData(
  sourceRecords: IRecordData[],
  targetRecords: IRecordData[],
  config: IMergeConfig,
): { toMerge: Record<string, unknown>[]; toSkip: IRecordData[]; toDeleteIds: string[] } {
  const { toMerge, toSkip, toDeleteIds } = deduplicateRecords(sourceRecords, targetRecords, config);

  // 将待合并的源记录转换为目标字段格式
  const mappedRecords = toMerge.map((record) => mapRecordFields(record, config));

  return { toMerge: mappedRecords, toSkip, toDeleteIds };
}

/**
 * 生成预览数据
 */
export function generatePreview(
  sourceRecords: IRecordData[],
  targetRecords: IRecordData[],
  config: IMergeConfig,
  sourceTableName: string,
): IPreviewRecord[] {
  const { toMerge, toSkip } = deduplicateRecords(sourceRecords, targetRecords, config);

  const previewRecords: IPreviewRecord[] = [];

  // 待合并的记录
  for (const record of toMerge) {
    const mappedFields = mapRecordFields(record, config);
    previewRecords.push({
      recordId: record.recordId,
      sourceTableName,
      fields: mappedFields,
      isDuplicate: false,
      isParent: !record.parentRecordId,
      parentRecordId: record.parentRecordId,
    });
  }

  // 待跳过的记录（标记为重复）
  for (const record of toSkip) {
    const mappedFields = mapRecordFields(record, config);
    previewRecords.push({
      recordId: record.recordId,
      sourceTableName,
      fields: mappedFields,
      isDuplicate: true,
      isParent: !record.parentRecordId,
      parentRecordId: record.parentRecordId,
    });
  }

  return previewRecords;
}
