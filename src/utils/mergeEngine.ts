import type {
  IRecordData,
  IFieldMapping,
  IDedupConfig,
  IMergeConfig,
  IPreviewRecord,
} from '@/types';

/**
 * 根据去重配置生成记录的唯一键
 */
export function generateRecordKey(
  record: IRecordData,
  config: IDedupConfig,
  mappings: IFieldMapping[],
): string {
  if (!config.enabled) {
    // 未启用去重时，使用记录 ID 作为唯一标识
    return record.recordId;
  }

  if (config.mode === 'all_fields') {
    // 全字段模式：使用所有映射字段的值生成键
    const keyObj: Record<string, unknown> = {};
    for (const mapping of mappings) {
      keyObj[mapping.targetFieldId] = record.fields[mapping.sourceFieldId];
    }
    return JSON.stringify(keyObj);
  }

  // 指定字段模式：仅使用指定字段的值生成键
  const keyObj: Record<string, unknown> = {};
  for (const mapping of mappings) {
    if (config.dedupFields.includes(mapping.targetFieldId)) {
      keyObj[mapping.targetFieldId] = record.fields[mapping.sourceFieldId];
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
  const existingKeys = new Set<string>();
  for (const record of existingRecords) {
    const key = generateRecordKey(record, config.dedupConfig, config.fieldMappings);
    existingKeys.add(key);
  }

  const toMerge: IRecordData[] = [];
  const toSkip: IRecordData[] = [];

  for (const sourceRecord of sourceRecords) {
    const key = generateRecordKey(sourceRecord, config.dedupConfig, config.fieldMappings);

    if (existingKeys.has(key)) {
      // 重复记录
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
    });
  }

  return previewRecords;
}
