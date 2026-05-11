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
  return JSON.stringify(keyObj);
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
 * @returns 包含 toMerge（待合并）和 toSkip（待跳过）的记录数组
 */
export function deduplicateRecords(
  sourceRecords: IRecordData[],
  existingRecords: IRecordData[],
  config: IMergeConfig,
): { toMerge: IRecordData[]; toSkip: IRecordData[] } {
  if (!config.dedupConfig.enabled) {
    // 未启用去重，所有记录都合并
    return { toMerge: [...sourceRecords], toSkip: [] };
  }

  // 构建目标表中已有记录的键集合
  // 关键修复：目标记录的 fields key 是目标字段 ID，所以 isSourceRecord = false
  const existingKeys = new Set<string>();
  for (const record of existingRecords) {
    const key = generateRecordKey(record, config.dedupConfig, config.fieldMappings, false);
    existingKeys.add(key);
  }
  debugLog(`[去重] 目标+已合并记录数: ${existingRecords.length}, 去重模式: ${config.dedupConfig.mode}`);

  // 同时构建源记录自身的键集合（用于源表内去重）
  const sourceKeys = new Set<string>();

  const toMerge: IRecordData[] = [];
  const toSkip: IRecordData[] = [];

  for (const sourceRecord of sourceRecords) {
    // 源记录用 sourceFieldId 取值
    const key = generateRecordKey(sourceRecord, config.dedupConfig, config.fieldMappings, true);
    const hitExisting = existingKeys.has(key);
    const hitSource = sourceKeys.has(key);

    if (hitExisting || hitSource) {
      // 与目标表重复 或 与前面已处理的源记录重复
      debugLog(`[去重] 跳过 ${sourceRecord.recordId} (命中${hitExisting ? '目标' : '源表'}), key=${key.slice(0, 150)}`);
      if (config.dedupConfig.strategy === 'overwrite') {
        toMerge.push(sourceRecord);
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

  return { toMerge, toSkip };
}

/**
 * 将一条映射后的记录按拆分配置拆分为多条记录
 * 主字段值按分隔符拆分，同步拆分字段一一对应拆分
 */
export function splitRecord(
  mappedFields: Record<string, unknown>,
  config: ISplitConfig,
): Record<string, unknown>[] {
  if (!config.enabled || !config.separator) {
    return [mappedFields];
  }

  // 获取主字段的目标字段名（通过 fieldMappings 查找）
  // mappedFields 的 key 是 targetFieldId
  const primaryValue = mappedFields[config.primaryFieldId];
  if (primaryValue === undefined || primaryValue === null || primaryValue === '') {
    return [mappedFields];
  }

  const primaryParts = String(primaryValue).split(config.separator);
  if (primaryParts.length <= 1) {
    return [mappedFields];
  }

  // 拆分同步字段
  const syncPartsMap = new Map<string, string[]>();
  for (const syncFieldId of config.syncFieldIds) {
    const syncValue = mappedFields[syncFieldId];
    if (syncValue !== undefined && syncValue !== null && syncValue !== '') {
      syncPartsMap.set(syncFieldId, String(syncValue).split(config.separator));
    }
  }

  const result: Record<string, unknown>[] = [];
  for (let i = 0; i < primaryParts.length; i++) {
    const record = { ...mappedFields };
    record[config.primaryFieldId] = primaryParts[i].trim();

    // 同步拆分字段
    for (const [fieldId, parts] of syncPartsMap) {
      record[fieldId] = i < parts.length ? parts[i].trim() : '';
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
 * @returns 待合并的记录和待跳过的记录
 */
export function mergeData(
  sourceRecords: IRecordData[],
  targetRecords: IRecordData[],
  config: IMergeConfig,
): { toMerge: Record<string, unknown>[]; toSkip: IRecordData[] } {
  const { toMerge, toSkip } = deduplicateRecords(sourceRecords, targetRecords, config);

  // 将待合并的源记录转换为目标字段格式
  let mappedRecords = toMerge.map((record) => mapRecordFields(record, config));

  // 如果启用了拆分，对每条记录进行拆分
  if (config.splitConfig.enabled) {
    // 将源字段 ID 转换为目标字段 ID
    const primaryMapping = config.fieldMappings.find(
      (m) => m.sourceFieldId === config.splitConfig.primaryFieldId,
    );
    const syncTargetIds = config.splitConfig.syncFieldIds.map((sid) => {
      const m = config.fieldMappings.find((m) => m.sourceFieldId === sid);
      return m?.targetFieldId || sid;
    });

    if (primaryMapping) {
      const splitConfigWithTargetIds: ISplitConfig = {
        ...config.splitConfig,
        primaryFieldId: primaryMapping.targetFieldId,
        syncFieldIds: syncTargetIds,
      };

      const splitRecords: Record<string, unknown>[] = [];
      for (const record of mappedRecords) {
        const parts = splitRecord(record, splitConfigWithTargetIds);
        splitRecords.push(...parts);
      }
      debugLog(`[拆分] 拆分前 ${mappedRecords.length} 条 → 拆分后 ${splitRecords.length} 条`);
      mappedRecords = splitRecords;
    }
  }

  return { toMerge: mappedRecords, toSkip };
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
