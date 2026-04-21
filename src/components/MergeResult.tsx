import React from 'react';
import { Card, Statistic, Tag, Typography, Space, Table, Timeline, Progress } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import type { IMergeResult, ITimeRecord } from '@/types';

const { Text, Title } = Typography;

interface IMergeResultProps {
  /** 合并结果 */
  result: IMergeResult;
}

/** 格式化耗时 */
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
};

/** 获取耗时颜色 */
const getDurationColor = (ms: number, maxMs: number): string => {
  const ratio = maxMs > 0 ? ms / maxMs : 0;
  if (ratio > 0.5) return '#ff4d4f';
  if (ratio > 0.25) return '#faad14';
  return '#52c41a';
};

const MergeResult: React.FC<IMergeResultProps> = ({ result }) => {
  /** 判断结果状态 */
  const getStatus = () => {
    if (result.errorMessages.length === 0) return 'success';
    if (result.mergedRecords > 0) return 'partial';
    return 'error';
  };

  const status = getStatus();

  /** 状态配置 */
  const statusConfig = {
    success: {
      color: '#52c41a',
      icon: <CheckCircleOutlined />,
      text: '合并成功',
      bg: '#f6ffed',
      border: '#b7eb8f',
    },
    partial: {
      color: '#faad14',
      icon: <WarningOutlined />,
      text: '部分成功',
      bg: '#fffbe6',
      border: '#ffe58f',
    },
    error: {
      color: '#ff4d4f',
      icon: <CloseCircleOutlined />,
      text: '合并失败',
      bg: '#fff2f0',
      border: '#ffccc7',
    },
  };

  const config = statusConfig[status];

  /** 耗时阶段表格列 */
  const timingColumns = [
    {
      title: '阶段',
      dataIndex: 'phase',
      key: 'phase',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 100,
      render: (ms: number) => (
        <Text style={{ color: result.timings ? getDurationColor(ms, result.timings.totalDuration) : undefined }}>
          {formatDuration(ms)}
        </Text>
      ),
    },
    {
      title: '占比',
      dataIndex: 'duration',
      key: 'percent',
      width: 120,
      render: (ms: number) => {
        const percent = result.timings ? Math.round((ms / result.timings.totalDuration) * 100) : 0;
        return (
          <Progress
            percent={percent}
            size="small"
            strokeColor={result.timings ? getDurationColor(ms, result.timings.totalDuration) : undefined}
            format={() => `${percent}%`}
          />
        );
      },
    },
  ];

  return (
    <div className="merge-result">
      {/* 状态卡片 */}
      <Card
        className="result-status-card"
        style={{
          background: config.bg,
          borderColor: config.border,
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div className="result-status-header">
            <Space>
              <span style={{ fontSize: 24, color: config.color }}>{config.icon}</span>
              <Title level={4} style={{ margin: 0, color: config.color }}>
                {config.text}
              </Title>
            </Space>
          </div>

          {/* 统计数据 */}
          <div className="result-statistics">
            <Statistic
              title="总记录数"
              value={result.totalRecords}
              valueStyle={{ fontSize: 18 }}
            />
            <Statistic
              title="成功合并"
              value={result.mergedRecords}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
            <Statistic
              title="跳过（去重）"
              value={result.skippedRecords}
              valueStyle={{ fontSize: 18, color: '#faad14' }}
              prefix={<WarningOutlined />}
            />
          </div>

          {/* 父子记录统计 */}
          {(result.parentRecords > 0 || result.childRecords > 0) && (
            <div className="result-parent-child">
              <Space>
                <NodeIndexOutlined style={{ color: '#722ed1' }} />
                <Text strong>层级记录：</Text>
                <Tag color="purple">父记录 {result.parentRecords} 条</Tag>
                <Tag color="cyan">子记录 {result.childRecords} 条</Tag>
              </Space>
            </div>
          )}
        </Space>
      </Card>

      {/* 耗时详情 */}
      {result.timings && (
        <Card title={<Space><ClockCircleOutlined />耗时详情</Space>} className="result-timing-card" size="small">
          {/* 总耗时 */}
          <div className="timing-total">
            <Text type="secondary">总耗时：</Text>
            <Text strong style={{ fontSize: 18, color: '#3370ff' }}>
              {formatDuration(result.timings.totalDuration)}
            </Text>
          </div>

          {/* 各阶段耗时时间线 */}
          <div className="timing-timeline">
            <Timeline
              items={result.timings.phases.map((phase, index) => ({
                color: getDurationColor(phase.duration, result.timings!.totalDuration),
                children: (
                  <div className="timing-phase-item">
                    <div className="timing-phase-header">
                      <Text strong>{phase.phase}</Text>
                      <Tag color={
                        getDurationColor(phase.duration, result.timings!.totalDuration) === '#52c41a'
                          ? 'green'
                          : getDurationColor(phase.duration, result.timings!.totalDuration) === '#faad14'
                            ? 'orange'
                            : 'red'
                      }>
                        {formatDuration(phase.duration)}
                      </Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      占比 {result.timings ? Math.round((phase.duration / result.timings.totalDuration) * 100) : 0}%
                    </Text>
                  </div>
                ),
              }))}
            />
          </div>

          {/* 耗时明细表格 */}
          {result.timings.phases.length > 0 && (
            <Table
              dataSource={result.timings.phases.map((p, i) => ({ ...p, key: i }))}
              columns={timingColumns}
              pagination={false}
              size="small"
              className="timing-table"
            />
          )}
        </Card>
      )}

      {/* 错误详情 */}
      {result.errorMessages.length > 0 && (
        <Card
          title={<Space><CloseCircleOutlined style={{ color: '#ff4d4f' }} />错误详情</Space>}
          className="result-error-card"
          size="small"
        >
          <div className="result-errors">
            {result.errorMessages.map((error, index) => (
              <div key={index} className="error-item">
                <Tag color="red">错误 {index + 1}</Tag>
                <Text type="danger">{error}</Text>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default MergeResult;
