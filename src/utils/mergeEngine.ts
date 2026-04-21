import type {
  IRecordData,
  IFieldMapping,
  IDedupConfig,
  IMergeConfig,
  IPreviewRecord,
} from '@/types';

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
      keyObj[mapping.targetFieldId] = record.fields[fieldId];
    }
    return JSON.stringify(keyObj);
  }

  // 指定字段模式：仅使用指定字段的值生成键
  const keyObj: Record<string, unknown> = {};
  for (const mapping of mappings) {
    if (config.dedupFields.includes(mapping.targetFieldId)) {
      const fieldId = isSourceRecord ? mapping.sourceFieldId : mapping.targetFieldId;
      keyObj[mapping.targetFieldId] = record.fields[fieldId];
    }
  }
  return JSON.stringify(keyObj);
}

/**
 * 按映射关系转换源记录字段为目标字段格式
 */
export function mapRecordFields(
  sourceRecord: IRecordData,
  config: IMergeConfig,
): Record<string, unknown> {
  const mappedFields: Record<string, unknown> = {};

  for (const mapping of config.fieldMappings) {
    const sourceValue = sourceRecord.fields[mapping.sourceFieldId];
    if (sourceValue !== undefined && sourceValue !== null) {
      mappedFields[mapping.targetFieldId] = sourceValue;
    }
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

  // 同时构建源记录自身的键集合（用于源表内去重）
  const sourceKeys = new Set<string>();

  const toMerge: IRecordData[] = [];
  const toSkip: IRecordData[] = [];

  for (const sourceRecord of sourceRecords) {
    // 源记录用 sourceFieldId 取值
    const key = generateRecordKey(sourceRecord, config.dedupConfig, config.fieldMappings, true);

    if (existingKeys.has(key) || sourceKeys.has(key)) {
      // 与目标表重复 或 与前面已处理的源记录重复
      if (config.dedupConfig.strategy === 'overwrite') {
        // 覆盖策略：仍然合并（后续写入会覆盖）
        toMerge.push(sourceRecord);
      } else {
        // 跳过策略：跳过该记录
        toSkip.push(sourceRecord);
      }
    } else {
      // 非重复记录，直接合并
      toMerge.push(sourceRecord);
    }

    // 将当前源记录的 key 加入集合（防止源表内重复）
    sourceKeys.add(key);
  }

  return { toMerge, toSkip };
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
  const mappedRecords = toMerge.map((record) => mapRecordFields(record, config));

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
