import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConfigProvider, Steps, Button, message, Spin } from 'antd';
import {
  TableOutlined,
  SwapOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import type {
  ITableMeta,
  IFieldMapping,
  IDedupConfig,
  IMergeConfig,
  IMergeResult,
  IMergeTimings,
  ITimeRecord,
  IRecordData,
} from '@/types';
import {
  getTableList,
  getRecordCount,
  getRecords,
  getTableName,
  detectSelfLinkFieldId,
  ensureSelfLinkField,
  batchCreateRecordsWithHierarchy,
  batchCreateRecords,
} from '@/services/bitableService';
import TableSelector from '@/components/TableSelector';
import FieldMappingConfig from '@/components/FieldMappingConfig';
import DedupConfig from '@/components/DedupConfig';
import MergePreview from '@/components/MergePreview';

/** 版本号 - 每次修复后递增 */
const APP_VERSION = 'v1.0.5';
const defaultDedupConfig: IDedupConfig = {
  enabled: false,
  mode: 'all_fields',
  dedupFields: [],
  strategy: 'skip',
};

/**
 * 耗时计时器工具类
 */
class PhaseTimer {
  private phases: ITimeRecord[] = [];
  private startTime = 0;

  /** 开始总计时 */
  start() {
    this.startTime = Date.now();
    this.phases = [];
  }

  /** 记录一个阶段的耗时 */
  recordPhase(phase: string, fn: () => Promise<void>): Promise<number> {
    const phaseStart = Date.now();
    return fn().then(() => {
      const phaseEnd = Date.now();
      const duration = phaseEnd - phaseStart;
      this.phases.push({
        phase,
        duration,
        startTime: phaseStart,
        endTime: phaseEnd,
      });
      return duration;
    });
  }

  /** 结束总计时并返回统计结果 */
  stop(): IMergeTimings {
    const endTime = Date.now();
    return {
      totalDuration: endTime - this.startTime,
      startTime: this.startTime,
      endTime,
      phases: this.phases,
    };
  }
}

const App: React.FC = () => {
  /** 当前步骤 */
  const [currentStep, setCurrentStep] = useState(0);
  /** 表格列表 */
  const [tables, setTables] = useState<ITableMeta[]>([]);
  /** 加载状态 */
  const [loading, setLoading] = useState(false);
  /** 选中的源表 ID 列表 */
  const [sourceTableIds, setSourceTableIds] = useState<string[]>([]);
  /** 选中的目标表 ID */
  const [targetTableId, setTargetTableId] = useState<string>('');
  /** 字段映射 */
  const [fieldMappings, setFieldMappings] = useState<IFieldMapping[]>([]);
  /** 去重配置 */
  const [dedupConfig, setDedupConfig] = useState<IDedupConfig>(defaultDedupConfig);
  /** 合并结果 */
  const [mergeResult, setMergeResult] = useState<IMergeResult | null>(null);
  /** 是否正在合并 */
  const [merging, setMerging] = useState(false);
  /** 合并进度文本 */
  const [progressText, setProgressText] = useState('');
  /** 计时器引用 */
  const timerRef = useRef<PhaseTimer>(new PhaseTimer());

  /** 初始化加载表格列表 */
  useEffect(() => {
    loadTables();
  }, []);

  /** 加载表格列表 */
  const loadTables = async () => {
    setLoading(true);
    try {
      const tableList = await getTableList();
      const tablesWithCount = await Promise.all(
        tableList.map(async (table) => {
          try {
            const count = await getRecordCount(table.id);
            return { ...table, recordCount: count };
          } catch {
            return { ...table, recordCount: 0 };
          }
        }),
      );
      setTables(tablesWithCount);
    } catch (err) {
      message.error('加载表格列表失败，请确认在多维表格环境中运行');
      console.error('加载表格列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  /** 获取当前合并配置 */
  const getMergeConfig = useCallback((): IMergeConfig => {
    return {
      sourceTableIds,
      targetTableId,
      fieldMappings,
      dedupConfig,
    };
  }, [sourceTableIds, targetTableId, fieldMappings, dedupConfig]);

  /** 执行合并操作（含耗时统计和父记录支持） */
  const handleExecuteMerge = useCallback(async () => {
    const config = getMergeConfig();
    if (config.sourceTableIds.length === 0 || !config.targetTableId) {
      message.warning('请先完成配置');
      return;
    }

    setMerging(true);
    setMergeResult(null);
    const timer = new PhaseTimer();
    timer.start();
    timerRef.current = timer;

    const result: IMergeResult = {
      totalRecords: 0,
      mergedRecords: 0,
      skippedRecords: 0,
      parentRecords: 0,
      childRecords: 0,
      errorMessages: [],
    };

    try {
      // 阶段1：加载目标表数据
      setProgressText('正在加载目标表数据...');
      await timer.recordPhase('加载目标表数据', async () => {
        // 预加载，实际数据在循环中使用
      });
      const targetRecords = await getRecords(config.targetTableId);

      // 检测源表是否有父子关系
      // 先加载所有源表数据来检测
      let hasAnyParentChild = false;
      const allSourceRecordsMap = new Map<string, IRecordData[]>();
      for (const sourceTableId of config.sourceTableIds) {
        const records = await getRecords(sourceTableId);
        allSourceRecordsMap.set(sourceTableId, records);
        if (records.some((r) => r.parentRecordId)) {
          hasAnyParentChild = true;
        }
      }

      // 如果源表有父子关系，确保目标表有自关联字段
      let targetLinkFieldId: string | null = null;
      if (hasAnyParentChild) {
        targetLinkFieldId = await ensureSelfLinkField(config.targetTableId);
      }

      // 动态导入合并引擎
      const { mergeData } = await import('@/utils/mergeEngine');

      // 逐个源表处理
      for (let si = 0; si < config.sourceTableIds.length; si++) {
        const sourceTableId = config.sourceTableIds[si];
        const sourceTableName = tables.find((t) => t.id === sourceTableId)?.name || sourceTableId;

        try {
          // 阶段2：加载源表数据（已预加载）
          setProgressText(`正在处理源表 (${sourceTableName})...`);
          let sourceRecords: IRecordData[] = [];
          await timer.recordPhase(`加载源表: ${sourceTableName}`, async () => {
            sourceRecords = allSourceRecordsMap.get(sourceTableId) || await getRecords(sourceTableId);
          });

          result.totalRecords += sourceRecords.length;

          // 统计父子记录数
          const parentCount = sourceRecords.filter((r) => !r.parentRecordId).length;
          const childCount = sourceRecords.filter((r) => r.parentRecordId).length;
          result.parentRecords += parentCount;
          result.childRecords += childCount;

          // 阶段3：去重计算
          setProgressText(`正在计算去重 (${sourceTableName})...`);
          let toMerge: Record<string, unknown>[] = [];
          let toSkip: IRecordData[] = [];
          await timer.recordPhase(`去重计算: ${sourceTableName}`, async () => {
            const mergeResult = mergeData(sourceRecords, targetRecords, config);
            toMerge = mergeResult.toMerge;
            toSkip = mergeResult.toSkip;
          });
          result.skippedRecords += toSkip.length;

          if (toMerge.length === 0) continue;

          // 阶段4：写入记录
          setProgressText(`正在写入记录 (${sourceTableName}, ${toMerge.length} 条)...`);
          await timer.recordPhase(`写入记录: ${sourceTableName}`, async () => {
            // 检查是否存在父子关系需要处理
            const hasParentChild = sourceRecords.some((r) => r.parentRecordId);

            if (hasParentChild && targetLinkFieldId) {
              // 有父子关系：按层级顺序写入
              // 1. 先确定哪些源记录被去重跳过了
              const skippedRecordIds = new Set(toSkip.map((r) => r.recordId));
              // 2. 构建源记录 ID -> 映射后字段的查找表
              const mappedFieldsMap = new Map<string, Record<string, unknown>>();
              for (const r of sourceRecords) {
                mappedFieldsMap.set(r.recordId, mapSingleRecord(r, config));
              }
              // 3. 构建待写入记录的元数据（排除被去重跳过的记录）
              const recordsWithMeta = sourceRecords
                .filter((r) => !skippedRecordIds.has(r.recordId))
                .map((r) => ({
                  fields: mappedFieldsMap.get(r.recordId)!,
                  sourceRecordId: r.recordId,
                  isParent: !r.parentRecordId,
                  sourceParentId: r.parentRecordId,
                  linkFieldId: targetLinkFieldId,
                }));

              const { createdCount } = await batchCreateRecordsWithHierarchy(
                config.targetTableId,
                recordsWithMeta,
              );
              result.mergedRecords += createdCount;
            } else {
              // 无父子关系：直接批量写入
              const createdCount = await batchCreateRecords(config.targetTableId, toMerge);
              result.mergedRecords += createdCount;
            }
          });

          // 将新写入的记录加入目标记录（用于后续源表去重）
          for (const fields of toMerge) {
            targetRecords.push({
              recordId: `new_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              fields,
            });
          }
        } catch (err: any) {
          const errorMsg = `合并源表 "${sourceTableName}" 时出错: ${err?.message || '未知错误'}`;
          result.errorMessages.push(errorMsg);
          console.error(errorMsg, err);
        }
      }

      // 结束计时
      const timings = timer.stop();
      result.timings = timings;

      setMergeResult(result);

      if (result.errorMessages.length === 0) {
        message.success(
          `合并完成！成功 ${result.mergedRecords} 条，跳过 ${result.skippedRecords} 条，耗时 ${formatDuration(timings.totalDuration)}`,
        );
      } else if (result.mergedRecords > 0) {
        message.warning(`合并部分完成，有 ${result.errorMessages.length} 个错误`);
      } else {
        message.error('合并失败，请查看错误详情');
      }
    } catch (err: any) {
      const errorMsg = `合并过程中出错: ${err?.message || '未知错误'}`;
      result.errorMessages.push(errorMsg);
      result.timings = timer.stop();
      setMergeResult(result);
      message.error('合并失败，请查看错误详情');
      console.error(errorMsg, err);
    } finally {
      setMerging(false);
      setProgressText('');
    }
  }, [getMergeConfig, tables]);

  /** 映射单条记录字段 */
  const mapSingleRecord = (record: IRecordData, config: IMergeConfig): Record<string, unknown> => {
    const mapped: Record<string, unknown> = {};
    for (const mapping of config.fieldMappings) {
      const value = record.fields[mapping.sourceFieldId];
      if (value !== undefined && value !== null) {
        mapped[mapping.targetFieldId] = value;
      }
    }
    return mapped;
  };

  /** 格式化耗时 */
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  };

  /** 步骤验证 */
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 0:
        if (sourceTableIds.length === 0) {
          message.warning('请至少选择一个源表');
          return false;
        }
        return true;
      case 1:
        if (!targetTableId) {
          message.warning('请选择目标表');
          return false;
        }
        if (sourceTableIds.includes(targetTableId)) {
          message.warning('目标表不能与源表相同');
          return false;
        }
        return true;
      case 2:
        if (fieldMappings.length === 0) {
          message.warning('请至少配置一个字段映射');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  /** 下一步 */
  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 3));
    }
  };

  /** 上一步 */
  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  /** 重置所有状态 */
  const handleReset = () => {
    setCurrentStep(0);
    setSourceTableIds([]);
    setTargetTableId('');
    setFieldMappings([]);
    setDedupConfig(defaultDedupConfig);
    setMergeResult(null);
    setMerging(false);
    setProgressText('');
  };

  /** 步骤配置 */
  const steps = [
    {
      title: '选择源表',
      icon: <TableOutlined />,
      description: '选择要合并的数据表',
    },
    {
      title: '选择目标表',
      icon: <SwapOutlined />,
      description: '选择合并到的目标表',
    },
    {
      title: '配置规则',
      icon: <SettingOutlined />,
      description: '字段映射与去重设置',
    },
    {
      title: '预览执行',
      icon: <PlayCircleOutlined />,
      description: '预览并执行合并',
    },
  ];

  /** 渲染步骤内容 */
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <TableSelector
            tables={tables}
            selectedIds={sourceTableIds}
            mode="multiple"
            title="选择源表"
            description="请选择一个或多个需要合并的数据表作为数据来源"
            onChange={setSourceTableIds}
          />
        );
      case 1:
        return (
          <TableSelector
            tables={tables.filter((t) => !sourceTableIds.includes(t.id))}
            selectedIds={targetTableId ? [targetTableId] : []}
            mode="single"
            title="选择目标表"
            description="请选择一个数据表作为合并的目标（源表数据将写入此表）"
            onChange={(ids) => setTargetTableId(ids[0] || '')}
          />
        );
      case 2:
        return (
          <div className="step-config">
            <FieldMappingConfig
              sourceTables={tables.filter((t) => sourceTableIds.includes(t.id))}
              targetTable={tables.find((t) => t.id === targetTableId) || null}
              mappings={fieldMappings}
              onMappingsChange={setFieldMappings}
            />
            <DedupConfig
              config={dedupConfig}
              targetTable={tables.find((t) => t.id === targetTableId) || null}
              onChange={setDedupConfig}
            />
          </div>
        );
      case 3:
        return (
          <MergePreview
            mergeConfig={getMergeConfig()}
            onExecute={handleExecuteMerge}
            merging={merging}
            mergeResult={mergeResult}
            progressText={progressText}
          />
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="app-loading">
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#3370ff',
          borderRadius: 6,
        },
      }}
    >
      <div className="app-container">
        {/* 头部 */}
        <div className="app-header">
          <h2 className="app-title">多维表格合并 <span className="app-version">{APP_VERSION}</span></h2>
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={handleReset}
          >
            重置
          </Button>
        </div>

        {/* 步骤条 */}
        <Steps
          current={currentStep}
          items={steps}
          size="small"
          className="app-steps"
        />

        {/* 步骤内容 */}
        <div className="app-content">
          {renderStepContent()}
        </div>

        {/* 底部操作栏 */}
        <div className="app-footer">
          <div className="footer-left">
            {currentStep > 0 && (
              <Button onClick={handlePrev}>上一步</Button>
            )}
          </div>
          <div className="footer-right">
            {currentStep < 3 && (
              <Button type="primary" onClick={handleNext}>
                下一步
              </Button>
            )}
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default App;
