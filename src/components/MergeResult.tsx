import React, { useState } from 'react';
import { Card, Statistic, Tag, Typography, Space, Table, Timeline, Progress, Button } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  NodeIndexOutlined,
  BugOutlined,
  CopyOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import type { IMergeResult, ITimeRecord } from '@/types';
import { message } from 'antd';

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

      {/* 调试日志 */}
      {result.debugMessages && result.debugMessages.length > 0 && (
        <Card
          title={<Space><BugOutlined style={{ color: '#3370ff' }} />调试日志</Space>}
          className="result-error-card"
          size="small"
        >
          <div className="result-errors" style={{ maxHeight: 300, overflow: 'auto', fontSize: 12, fontFamily: 'monospace', background: '#f5f6f7', padding: 8, borderRadius: 4 }}>
            {result.debugMessages.map((log, index) => (
              <div key={index} style={{ lineHeight: '1.8', wordBreak: 'break-all' }}>{log}</div>
            ))}
          </div>
        </Card>
      )}

      {/* dryRun 参数 JSON */}
      {result.dryRunData && <DryRunParams data={result.dryRunData} />}
    </div>
  );
};

/** dryRun 参数 JSON 展示组件 */
const DryRunParams: React.FC<{ data: IMergeResult['dryRunData'] }> = ({ data }) => {
  if (!data) return null;

  const [copied, setCopied] = useState(false);
  const jsonStr = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      message.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = jsonStr;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      message.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card
      title={
        <Space>
          <CodeOutlined style={{ color: '#722ed1' }} />
          合并参数 JSON
          <Tag color="purple">仅生成参数</Tag>
        </Space>
      }
      size="small"
      extra={
        <Button
          type="primary"
          size="small"
          icon={<CopyOutlined />}
          onClick={handleCopy}
        >
          {copied ? '已复制' : '复制 JSON'}
        </Button>
      }
    >
      <div style={{ marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          此 JSON 包含合并配置指令，供服务端脚本通过 SDK 执行合并操作
        </Text>
      </div>
      <pre
        style={{
          maxHeight: 400,
          overflow: 'auto',
          fontSize: 11,
          fontFamily: 'monospace',
          background: '#f5f6f7',
          padding: 12,
          borderRadius: 4,
          lineHeight: '1.6',
          wordBreak: 'break-all',
          whiteSpace: 'pre-wrap',
          margin: 0,
        }}
      >
        {jsonStr}
      </pre>
    </Card>
  );
};

export default MergeResult;
