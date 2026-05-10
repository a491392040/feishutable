import React, { useEffect, useMemo } from 'react';
import { Card, Select, Button, Typography, Tag, Space, message, Input, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, SwapOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { ITableMeta, IFieldMapping } from '@/types';

const { Text } = Typography;

interface IFieldMappingConfigProps {
  /** 源表列表 */
  sourceTables: ITableMeta[];
  /** 目标表 */
  targetTable: ITableMeta | null;
  /** 当前映射关系 */
  mappings: IFieldMapping[];
  /** 映射变更回调 */
  onMappingsChange: (mappings: IFieldMapping[]) => void;
}

/**
 * 生成源字段的唯一复合键（fieldId + tableName），用于区分不同源表的同ID字段
 */
const sourceFieldKey = (fieldId: string, tableName: string) => `${fieldId}@${tableName}`;

const FieldMappingConfig: React.FC<IFieldMappingConfigProps> = ({
  sourceTables,
  targetTable,
  mappings,
  onMappingsChange,
}) => {
  /** 收集所有源表字段（用 id+tableName 去重，支持不同源表的同名字段） */
  const allSourceFields = useMemo(() => {
    const fieldMap = new Map<string, { id: string; name: string; tableName: string }>();
    for (const table of sourceTables) {
      for (const field of table.fields) {
        const key = sourceFieldKey(field.id, table.name);
        if (!fieldMap.has(key)) {
          fieldMap.set(key, {
            id: field.id,
            name: field.name,
            tableName: table.name,
          });
        }
      }
    }
    return Array.from(fieldMap.values());
  }, [sourceTables]);

  /** 已映射的源字段复合键集合（用 id@tableName 区分不同源表的同ID字段） */
  const mappedSourceFieldKeys = useMemo(() => {
    return new Set(mappings.map((m) => sourceFieldKey(m.sourceFieldId, m.sourceTableName)));
  }, [mappings]);

  /** 自动匹配同名字段（允许多个源字段映射到同一个目标字段） */
  useEffect(() => {
    if (!targetTable || sourceTables.length === 0) return;

    const autoMappings: IFieldMapping[] = [];

    for (const sourceField of allSourceFields) {
      const matchTargetField = targetTable.fields.find(
        (tf) => tf.name === sourceField.name,
      );
      if (matchTargetField) {
        autoMappings.push({
          sourceFieldId: sourceField.id,
          sourceFieldName: sourceField.name,
          sourceTableName: sourceField.tableName,
          targetFieldId: matchTargetField.id,
          targetFieldName: matchTargetField.name,
          defaultValue: '',
        });
      }
    }

    if (autoMappings.length > 0 && mappings.length === 0) {
      onMappingsChange(autoMappings);
      message.info(`已自动匹配 ${autoMappings.length} 个同名字段`);
    }
  }, [targetTable, sourceTables]);

  /** 添加映射 */
  const handleAddMapping = () => {
    // 找到第一个未映射的源字段（用复合键判断）
    const unmappedSource = allSourceFields.find(
      (f) => !mappedSourceFieldKeys.has(sourceFieldKey(f.id, f.tableName)),
    );
    if (!unmappedSource) {
      message.warning('所有源字段都已映射');
      return;
    }

    // 找到第一个目标字段（允许重复映射到同一目标字段）
    const firstTarget = targetTable?.fields[0];
    if (!firstTarget) {
      message.warning('目标表没有可用字段');
      return;
    }

    const newMapping: IFieldMapping = {
      sourceFieldId: unmappedSource.id,
      sourceFieldName: unmappedSource.name,
      sourceTableName: unmappedSource.tableName,
      targetFieldId: firstTarget.id,
      targetFieldName: firstTarget.name,
      defaultValue: '',
    };

    onMappingsChange([...mappings, newMapping]);
  };

  /** 删除映射 */
  const handleRemoveMapping = (index: number) => {
    const newMappings = mappings.filter((_, i) => i !== index);
    onMappingsChange(newMappings);
  };

  /** 修改映射的源字段 */
  const handleSourceFieldChange = (index: number, compositeKey: string) => {
    const sourceField = allSourceFields.find(
      (f) => sourceFieldKey(f.id, f.tableName) === compositeKey,
    );
    if (!sourceField) return;

    const newMappings = [...mappings];
    newMappings[index] = {
      ...newMappings[index],
      sourceFieldId: sourceField.id,
      sourceFieldName: sourceField.name,
      sourceTableName: sourceField.tableName,
    };
    onMappingsChange(newMappings);
  };

  /** 修改映射的目标字段 */
  const handleTargetFieldChange = (index: number, targetFieldId: string) => {
    const targetField = targetTable?.fields.find((f) => f.id === targetFieldId);
    if (!targetField) return;

    const newMappings = [...mappings];
    newMappings[index] = {
      ...newMappings[index],
      targetFieldId: targetField.id,
      targetFieldName: targetField.name,
    };
    onMappingsChange(newMappings);
  };

  /** 修改默认值 */
  const handleDefaultValueChange = (index: number, value: string) => {
    const newMappings = [...mappings];
    newMappings[index] = {
      ...newMappings[index],
      defaultValue: value,
    };
    onMappingsChange(newMappings);
  };

  return (
    <Card
      title={
        <Space>
          <SwapOutlined />
          <span>字段映射</span>
        </Space>
      }
      size="small"
      className="field-mapping-card"
    >
      <div className="mapping-description">
        <Text type="secondary">
          配置源表字段与目标表字段的对应关系，多个源字段可映射到同一目标字段
        </Text>
      </div>

      {/* 映射列表 */}
      <div className="mapping-list">
        {mappings.map((mapping, index) => (
          <div key={index} className="mapping-item">
            <Select
              value={sourceFieldKey(mapping.sourceFieldId, mapping.sourceTableName)}
              onChange={(val) => handleSourceFieldChange(index, val)}
              className="mapping-select"
              placeholder="选择源字段"
              size="small"
              options={allSourceFields.map((f) => ({
                value: sourceFieldKey(f.id, f.tableName),
                label: `${f.name}（${f.tableName}）`,
              }))}
            />
            <span className="mapping-arrow">→</span>
            <Select
              value={mapping.targetFieldId}
              onChange={(val) => handleTargetFieldChange(index, val)}
              className="mapping-select"
              placeholder="选择目标字段"
              size="small"
              options={targetTable?.fields.map((f) => ({
                value: f.id,
                label: f.name,
              })) || []}
            />
            <Tooltip title="当源字段值为空时使用此默认值">
              <Input
                className="mapping-default-value"
                placeholder="默认值"
                size="small"
                value={mapping.defaultValue || ''}
                onChange={(e) => handleDefaultValueChange(index, e.target.value)}
                suffix={
                  <QuestionCircleOutlined style={{ color: '#bfbfbf', fontSize: 12 }} />
                }
              />
            </Tooltip>
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => handleRemoveMapping(index)}
            />
          </div>
        ))}

        {mappings.length === 0 && (
          <div className="mapping-empty">
            <Text type="secondary">暂无映射，请点击下方按钮添加</Text>
          </div>
        )}
      </div>

      {/* 添加映射按钮 */}
      <Button
        type="dashed"
        block
        icon={<PlusOutlined />}
        onClick={handleAddMapping}
        size="small"
      >
        添加映射
      </Button>

      {/* 映射统计 */}
      <div className="mapping-stats">
        <Tag color="blue">已映射: {mappings.length}</Tag>
        <Tag color="orange">源字段: {allSourceFields.length}</Tag>
        {targetTable && (
          <Tag color="green">目标字段: {targetTable.fields.length}</Tag>
        )}
      </div>
    </Card>
  );
};

export default FieldMappingConfig;
