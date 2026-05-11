/**
 * 字段元数据
 */
export interface IFieldMeta {
  /** 字段 ID */
  id: string;
  /** 字段名称 */
  name: string;
  /** 字段类型 */
  type: number;
}

/**
 * 数据表元数据
 */
export interface ITableMeta {
  /** 表 ID */
  id: string;
  /** 表名称 */
  name: string;
  /** 字段列表 */
  fields: IFieldMeta[];
  /** 记录数 */
  recordCount?: number;
}

/**
 * 字段映射关系
 */
export interface IFieldMapping {
  /** 源字段 ID */
  sourceFieldId: string;
  /** 源字段名称 */
  sourceFieldName: string;
  /** 源表名称（用于区分不同源表的同ID字段） */
  sourceTableName: string;
  /** 目标字段 ID */
  targetFieldId: string;
  /** 目标字段名称 */
  targetFieldName: string;
  /** 默认值（当源字段值为空时使用） */
  defaultValue?: string;
}

/**
 * 去重配置
 */
export interface IDedupConfig {
  /** 是否启用去重 */
  enabled: boolean;
  /** 去重模式 */
  mode: 'all_fields' | 'specified_fields';
  /** 指定去重字段（当 mode 为 specified_fields 时使用） */
  dedupFields: string[];
  /** 去重策略 */
  strategy: 'skip' | 'overwrite';
}

/**
 * 字段拆分配置
 * 合并时根据分隔符将一条记录拆分为多条记录
 */
export interface ISplitConfig {
  /** 是否启用拆分 */
  enabled: boolean;
  /** 主字段 ID（值按分隔符拆分，决定拆分成几条） */
  primaryFieldId: string;
  /** 主字段名称 */
  primaryFieldName: string;
  /** 同步拆分字段 ID 列表（与主字段一一对应拆分） */
  syncFieldIds: string[];
  /** 同步拆分字段名称列表 */
  syncFieldNames: string[];
  /** 分隔符 */
  separator: string;
}

/**
 * 合并配置
 */
export interface IMergeConfig {
  /** 源表 ID 列表 */
  sourceTableIds: string[];
  /** 目标表 ID */
  targetTableId: string;
  /** 字段映射关系 */
  fieldMappings: IFieldMapping[];
  /** 去重配置 */
  dedupConfig: IDedupConfig;
  /** 字段拆分配置 */
  splitConfig: ISplitConfig;
  /** 是否仅生成参数（不执行写入） */
  dryRun?: boolean;
}

/**
 * 单个阶段的耗时记录
 */
export interface ITimeRecord {
  /** 阶段名称 */
  phase: string;
  /** 耗时（毫秒） */
  duration: number;
  /** 开始时间戳 */
  startTime: number;
  /** 结束时间戳 */
  endTime: number;
}

/**
 * 合并耗时统计
 */
export interface IMergeTimings {
  /** 总耗时（毫秒） */
  totalDuration: number;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 各阶段耗时明细 */
  phases: ITimeRecord[];
}

/**
 * dryRun 模式生成的参数数据（仅配置指令，不含实际数据）
 * 供服务端 @lark-base-open/node-sdk 使用
 */
export interface IDryRunData {
  /** Base 文档 ID（即 base_id / appToken） */
  baseId: string;
  /** PersonalBaseToken（用户需手动填入） */
  personalBaseToken: string;
  /** 源表列表 */
  sourceTables: {
    /** 表 ID */
    tableId: string;
    /** 表名 */
    tableName: string;
  }[];
  /** 目标表 */
  targetTable: {
    /** 表 ID */
    tableId: string;
    /** 表名 */
    tableName: string;
  };
  /** 字段映射关系（SDK 使用字段名操作） */
  fieldMappings: {
    /** 源字段名 */
    sourceFieldName: string;
    /** 目标字段名 */
    targetFieldName: string;
    /** 默认值（当源字段值为空时使用） */
    defaultValue?: string;
  }[];
  /** 去重配置 */
  dedupConfig: {
    /** 是否启用 */
    enabled: boolean;
    /** 去重字段名列表（SDK 使用字段名） */
    dedupFieldNames: string[];
    /** 去重策略：skip=跳过重复, overwrite=覆盖 */
    strategy: 'skip' | 'overwrite';
  };
  /** 字段拆分配置 */
  splitConfig: {
    /** 是否启用 */
    enabled: boolean;
    /** 主字段名（值按分隔符拆分） */
    primaryFieldName: string;
    /** 同步拆分字段名列表 */
    syncFieldNames: string[];
    /** 分隔符 */
    separator: string;
  };
}

/**
 * 合并结果
 */
export interface IMergeResult {
  /** 总记录数 */
  totalRecords: number;
  /** 已合并记录数 */
  mergedRecords: number;
  /** 跳过记录数 */
  skippedRecords: number;
  /** 父记录数 */
  parentRecords: number;
  /** 子记录数 */
  childRecords: number;
  /** 错误信息列表 */
  errorMessages: string[];
  /** 调试日志 */
  debugMessages?: string[];
  /** 耗时统计 */
  timings?: IMergeTimings;
  /** dryRun 模式生成的参数数据 */
  dryRunData?: IDryRunData;
}

/**
 * 记录数据
 */
export interface IRecordData {
  /** 记录 ID */
  recordId: string;
  /** 字段值映射 */
  fields: Record<string, unknown>;
  /** 父记录 ID（如果有的话，多维表格中通过关联字段实现父子关系） */
  parentRecordId?: string;
  /** 子记录 ID 列表 */
  childRecordIds?: string[];
}

/**
 * 预览记录
 */
export interface IPreviewRecord {
  /** 记录 ID */
  recordId: string;
  /** 来源表名称 */
  sourceTableName: string;
  /** 字段值 */
  fields: Record<string, unknown>;
  /** 是否为重复记录 */
  isDuplicate: boolean;
  /** 是否为父记录 */
  isParent?: boolean;
  /** 父记录 ID */
  parentRecordId?: string;
}
