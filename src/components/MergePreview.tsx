import React, { useState, useEffect, useCallback } from 'react';
import { Button, Table, Tag, Statistic, Progress, Typography, Space, Spin, Alert } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined, NodeIndexOutlined } from '@ant-design/icons';
import type { IMergeConfig, IMergeResult, IPreviewRecord } from '@/types';
import { getRecords, getTableName } from '@/services/bitableService';
import { mergeData, generatePreview } from '@/utils/mergeEngine';
import MergeResult from './MergeResult';

const { Text } = Typography;

interface IMergePreviewProps {
  /** 合并配置 */
  mergeConfig: IMergeConfig;
  /** 执行合并回调 */
  onExecute: () => void;
  /** 是否正在合并 */
  merging: boolean;
  /** 合并结果 */
  mergeResult: IMergeResult | null;
  /** 进度文本 */
  progressText?: string;
}

const MergePreview: React.FC<IMergePreviewProps> = ({
  mergeConfig,
  onExecute,
  merging,
  mergeResult,
  progressText,
}) => {
  /** 预览数据 */
  const [previewData, setPreviewData] = useState<IPreviewRecord[]>([]);
  /** 待合并数量 */
  const [toMergeCount, setToMergeCount] = useState(0);
  /** 待跳过数量 */
  const [toSkipCount, setToSkipCount] = useState(0);
  /** 总数量 */
  const [totalCount, setTotalCount] = useState(0);
  /** 父记录数量 */
  const [parentCount, setParentCount] = useState(0);
  /** 子记录数量 */
  const [childCount, setChildCount] = useState(0);
  /** 加载预览中 */
  const [loadingPreview, setLoadingPreview] = useState(false);

  /** 加载预览数据 */
  const loadPreview = useCallback(async () => {
    if (
      mergeConfig.sourceTableIds.length === 0 ||
      !mergeConfig.targetTableId ||
      mergeConfig.fieldMappings.length === 0
    ) {
      return;
    }

    setLoadingPreview(true);
    try {
      // 获取目标表记录
      const targetRecords = await getRecords(mergeConfig.targetTableId);

      let allPreviewRecords: IPreviewRecord[] = [];
      let totalMerge = 0;
      let totalSkip = 0;
      let totalAll = 0;
      let totalParent = 0;
      let totalChild = 0;

      // 遍历每个源表生成预览
      for (const sourceTableId of mergeConfig.sourceTableIds) {
        try {
          const sourceRecords = await getRecords(sourceTableId);
          const sourceTableName = await getTableName(sourceTableId);
          totalAll += sourceRecords.length;

          // 统计父子记录
          totalParent += sourceRecords.filter((r) => !r.parentRecordId).length;
          totalChild += sourceRecords.filter((r) => r.parentRecordId).length;

          // 计算合并数据
          const { toMerge, toSkip } = mergeData(sourceRecords, targetRecords, mergeConfig);
          totalMerge += toMerge.length;
          totalSkip += toSkip.length;

          // 生成预览记录
          const preview = generatePreview(
            sourceRecords,
            targetRecords,
            mergeConfig,
            sourceTableName,
          );
          allPreviewRecords = allPreviewRecords.concat(preview);
        } catch (err) {
          console.error(`加载源表 ${sourceTableId} 预览数据失败:`, err);
        }
      }

      setPreviewData(allPreviewRecords);
      setToMergeCount(totalMerge);
      setToSkipCount(totalSkip);
      setTotalCount(totalAll);
      setParentCount(totalParent);
      setChildCount(totalChild);
    } catch (err) {
      console.error('加载预览数据失败:', err);
    } finally {
      setLoadingPreview(false);
    }
  }, [mergeConfig]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  /** 预览表格列定义 */
  const columns = [
    {
      title: '状态',
      dataIndex: 'isDuplicate',
      key: 'status',
      width: 80,
      render: (isDuplicate: boolean, record: IPreviewRecord) => (
        <Space size={4}>
          {record.isParent !== undefined && (
            <Tag
              color={record.isParent ? 'purple' : 'cyan'}
              icon={<NodeIndexOutlined />}
              style={{ fontSize: 11 }}
            >
              {record.isParent ? '父' : '子'}
            </Tag>
          )}
          {isDuplicate ? (
            <Tag color="orange" icon={<CloseCircleOutlined />} style={{ fontSize: 11 }}>
              跳过
            </Tag>
          ) : (
            <Tag color="blue" icon={<CheckCircleOutlined />} style={{ fontSize: 11 }}>
              合并
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '来源表',
      dataIndex: 'sourceTableName',
      key: 'sourceTableName',
      width: 100,
      ellipsis: true,
    },
    {
      title: '字段值',
      dataIndex: 'fields',
      key: 'fields',
      render: (fields: Record<string, unknown>) => (
        <div className="preview-fields">
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="preview-field-item">
              <Text type="secondary" className="preview-field-key">
                {key}:
              </Text>
              <Text className="preview-field-value">
                {value === null || value === undefined
                  ? '(空)'
                  : String(value)}
              </Text>
            </div>
          ))}
        </div>
      ),
    },
  ];

  /** 合并进度百分比 */
  const mergePercent = totalCount > 0 ? Math.round((toMergeCount / totalCount) * 100) : 0;

  return (
    <div className="merge-preview">
      {/* 统计信息 */}
      <div className="preview-stats">
        <Statistic title="总记录数" value={totalCount} valueStyle={{ fontSize: 20 }} />
        <Statistic
          title="将合并"
          value={toMergeCount}
          valueStyle={{ fontSize: 20, color: '#3370ff' }}
        />
        <Statistic
          title="将跳过"
          value={toSkipCount}
          valueStyle={{ fontSize: 20, color: '#faad14' }}
        />
      </div>

      {/* 父子记录统计 */}
      {(parentCount > 0 || childCount > 0) && (
        <div className="preview-parent-child-stats">
          <Alert
            type="info"
            showIcon
            icon={<NodeIndexOutlined />}
            message={
              <Space>
                <span>检测到父子记录结构</span>
                <Tag color="purple">父记录: {parentCount}</Tag>
                <Tag color="cyan">子记录: {childCount}</Tag>
              </Space>
            }
            description="合并时将按层级顺序写入：先创建父记录，再创建子记录并自动关联"
          />
        </div>
      )}

      {/* 进度条 */}
      <div className="preview-progress">
        <Text type="secondary">合并比例</Text>
        <Progress
          percent={mergePercent}
          size="small"
          strokeColor="#3370ff"
          format={(percent) => `${percent}%`}
        />
      </div>

      {/* 合并进度提示 */}
      {merging && progressText && (
        <div className="merge-progress-alert">
          <Alert type="info" message={progressText} showIcon />
        </div>
      )}

      {/* 预览数据表格 */}
      <div className="preview-table-wrapper">
        {loadingPreview ? (
          <div className="preview-loading">
            <Spin tip="加载预览数据..." />
          </div>
        ) : previewData.length > 0 ? (
          <Table
            dataSource={previewData}
            columns={columns}
            rowKey="recordId"
            size="small"
            pagination={{ pageSize: 10, size: 'small' }}
            scroll={{ y: 300 }}
            className="preview-table"
          />
        ) : (
          <Text type="secondary">暂无预览数据</Text>
        )}
      </div>

      {/* 执行按钮 */}
      <div className="preview-actions">
        <Space>
          <Button onClick={loadPreview} disabled={loadingPreview || merging}>
            刷新预览
          </Button>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={onExecute}
            loading={merging}
            disabled={toMergeCount === 0 || merging}
          >
            {merging ? '合并中...' : `执行合并 (${toMergeCount} 条)`}
          </Button>
        </Space>
      </div>

      {/* 合并结果 */}
      {mergeResult && <MergeResult result={mergeResult} />}
    </div>
  );
};

export default MergePreview;
