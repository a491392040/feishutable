import React, { useEffect, useMemo } from 'react';
import { Card, Select, Button, Typography, Tag, Space, message } from 'antd';
import { PlusOutlined, DeleteOutlined, SwapOutlined } from '@ant-design/icons';
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

const FieldMappingConfig: React.FC<IFieldMappingConfigProps> = ({
  sourceTables,
  targetTable,
  mappings,
  onMappingsChange,
}) => {
  /** 收集所有源表字段（去重） */
  const allSourceFields = useMemo(() => {
    const fieldMap = new Map<string, { id: string; name: string; tableName: string }>();
    for (const table of sourceTables) {
      for (const field of table.fields) {
        if (!fieldMap.has(field.id)) {
          fieldMap.set(field.id, {
            id: field.id,
            name: field.name,
            tableName: table.name,
          });
        }
      }
    }
    return Array.from(fieldMap.values());
  }, [sourceTables]);

  /** 已映射的源字段 ID 集合 */
  const mappedSourceFieldIds = useMemo(() => {
    return new Set(mappings.map((m) => m.sourceFieldId));
  }, [mappings]);

  /** 已映射的目标字段 ID 集合 */
  const mappedTargetFieldIds = useMemo(() => {
    return new Set(mappings.map((m) => m.targetFieldId));
  }, [mappings]);

  /** 自动匹配同名字段 */
  useEffect(() => {
    if (!targetTable || sourceTables.length === 0) return;

    const autoMappings: IFieldMapping[] = [];
    const usedTargetIds = new Set<string>();

    for (const sourceField of allSourceFields) {
      const matchTargetField = targetTable.fields.find(
        (tf) => tf.name === sourceField.name && !usedTargetIds.has(tf.id),
      );
      if (matchTargetField) {
        autoMappings.push({
          sourceFieldId: sourceField.id,
          sourceFieldName: sourceField.name,
          targetFieldId: matchTargetField.id,
          targetFieldName: matchTargetField.name,
        });
        usedTargetIds.add(matchTargetField.id);
      }
    }

    if (autoMappings.length > 0 && mappings.length === 0) {
      onMappingsChange(autoMappings);
      message.info(`已自动匹配 ${autoMappings.length} 个同名字段`);
    }
  }, [targetTable, sourceTables]);

  /** 添加映射 */
  const handleAddMapping = () => {
    // 找到第一个未映射的源字段
    const unmappedSource = allSourceFields.find(
      (f) => !mappedSourceFieldIds.has(f.id),
    );
    if (!unmappedSource) {
      message.warning('所有源字段都已映射');
      return;
    }

    // 找到第一个未映射的目标字段
    const unmappedTarget = targetTable?.fields.find(
      (f) => !mappedTargetFieldIds.has(f.id),
    );
    if (!unmappedTarget) {
      message.warning('所有目标字段都已映射');
      return;
    }

    const newMapping: IFieldMapping = {
      sourceFieldId: unmappedSource.id,
      sourceFieldName: unmappedSource.name,
      targetFieldId: unmappedTarget.id,
      targetFieldName: unmappedTarget.name,
    };

    onMappingsChange([...mappings, newMapping]);
  };

  /** 删除映射 */
  const handleRemoveMapping = (index: number) => {
    const newMappings = mappings.filter((_, i) => i !== index);
    onMappingsChange(newMappings);
  };

  /** 修改映射的源字段 */
  const handleSourceFieldChange = (index: number, sourceFieldId: string) => {
    const sourceField = allSourceFields.find((f) => f.id === sourceFieldId);
    if (!sourceField) return;

    const newMappings = [...mappings];
    newMappings[index] = {
      ...newMappings[index],
      sourceFieldId: sourceField.id,
      sourceFieldName: sourceField.name,
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
          配置源表字段与目标表字段的对应关系，系统已自动匹配同名字段
        </Text>
      </div>

      {/* 映射列表 */}
      <div className="mapping-list">
        {mappings.map((mapping, index) => (
          <div key={index} className="mapping-item">
            <Select
              value={mapping.sourceFieldId}
              onChange={(val) => handleSourceFieldChange(index, val)}
              className="mapping-select"
              placeholder="选择源字段"
              size="small"
              options={allSourceFields.map((f) => ({
                value: f.id,
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
