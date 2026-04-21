import { bitable } from '@lark-base-open/js-sdk';

const logEl = document.getElementById('log')!;
let testRecordIds: string[] = [];
let _selfLinkFieldId: string | null = null;
let _tableId: string | null = null;
let _textFieldId: string | null = null;
let _workingMethod: number | null = null;

function log(msg: string, type?: string) {
  const div = document.createElement('div');
  if (type) div.className = type;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== 步骤1 ==========
(window as any).testEnvironment = async function () {
  log('--- 环境检测 ---', 'info');
  try {
    log(`bitable 对象: ✅ 存在`, 'ok');
    const table = await bitable.base.getActiveTable();
    log(`当前活动表: ✅ ${table.id}`, 'ok');
  } catch (err: any) {
    log(`环境检测失败: ${err.message}`, 'err');
  }
};

// ========== 步骤2 ==========
(window as any).testGetTableInfo = async function () {
  log('--- 获取表信息 ---', 'info');
  try {
    const table = await bitable.base.getActiveTable();
    const name = await table.getName();
    _tableId = table.id;
    log(`表名: ${name} (ID: ${table.id})`);

    const fieldMetaList = await table.getFieldMetaList();
    log(`字段总数: ${fieldMetaList.length}`);

    _selfLinkFieldId = null;
    _textFieldId = null;

    for (const fm of fieldMetaList) {
      const isLink = (fm.type === 18 || fm.type === 19);
      const isSelfLink = isLink && (fm as any).property && (fm as any).property.tableId === table.id;
      const isText = (fm.type === 1);
      const marker = isSelfLink ? ' 🔗[自关联]' : isLink ? ' 🔗[关联]' : '';
      if (isText && !_textFieldId) (marker as any) += ' 📝[文本]';
      log(`  - ${fm.name} (ID: ${fm.id}, 类型: ${fm.type})${marker}`, isSelfLink ? 'warn' : '');

      if (isSelfLink && !_selfLinkFieldId) _selfLinkFieldId = fm.id;
      if (isText && !_textFieldId) _textFieldId = fm.id;
    }

    if (_selfLinkFieldId) log(`✅ 找到自关联字段 ID: ${_selfLinkFieldId}`, 'ok');
    else log('❌ 未找到自关联字段！请先创建一个关联到自身的字段', 'err');

    if (_textFieldId) log(`✅ 找到文本字段 ID: ${_textFieldId}`, 'ok');

    const recordIdList = await table.getRecordIdList();
    log(`记录总数: ${recordIdList.length}`);
  } catch (err: any) {
    log(`获取表信息失败: ${err.message}`, 'err');
  }
};

// ========== 步骤3 ==========
(window as any).testAllLinkMethods = async function () {
  log('--- 开始测试关联写入 ---', 'info');
  if (!_selfLinkFieldId) { log('❌ 请先运行步骤2', 'err'); return; }

  const table = await bitable.base.getActiveTable();
  const linkFieldId = _selfLinkFieldId;

  try {
    // 创建父+子两条记录
    log('📝 创建测试记录...', 'info');
    const parentFields: Record<string, any> = {};
    if (_textFieldId) parentFields[_textFieldId] = '测试-父记录';
    const parentRecordId = await table.addRecord({ fields: parentFields });
    testRecordIds.push(parentRecordId);
    log(`✅ 父记录: ${parentRecordId}`, 'ok');

    const childFields: Record<string, any> = {};
    if (_textFieldId) childFields[_textFieldId] = '测试-子记录';
    const childRecordId = await table.addRecord({ fields: childFields });
    testRecordIds.push(childRecordId);
    log(`✅ 子记录: ${childRecordId}`, 'ok');
    await sleep(500);

    async function checkLink(rid: string) {
      const val = await table.getCellValue(linkFieldId, rid);
      const json = JSON.stringify(val);
      let hasLink = false;
      if (val) {
        if ((val as any).recordIds && (val as any).recordIds.length > 0) hasLink = true;
        if (Array.isArray(val) && val.length > 0) hasLink = true;
        if (typeof val === 'string' && val.indexOf('rec') === 0) hasLink = true;
      }
      log(`  结果: ${hasLink ? '✅ 成功！' : '❌ 失败'} 值: ${json}`, hasLink ? 'ok' : 'err');
      return hasLink;
    }

    async function clearLink(rid: string) {
      try { await table.setCellValue(linkFieldId, rid, null as any); await sleep(300); } catch (e: any) { log(`  清除失败: ${e.message}`, 'warn'); }
    }

    // 方式1
    log('', ''); log('【方式1】table.setCellValue(fieldId, recordId, IOpenLink对象)', 'info');
    try {
      await table.setCellValue(linkFieldId, childRecordId, { text: '', type: 'text', recordIds: [parentRecordId], tableId: _tableId } as any);
      if (await checkLink(childRecordId)) _workingMethod = 1;
    } catch (err: any) { log(`  ❌ 报错: ${err.message}`, 'err'); }
    await clearLink(childRecordId);

    // 方式2
    log('', ''); log('【方式2】field.setValue(recordId, [parentRecordId])', 'info');
    try {
      const field = await table.getField(linkFieldId);
      await (field as any).setValue(childRecordId, [parentRecordId]);
      if (await checkLink(childRecordId)) _workingMethod = 2;
    } catch (err: any) { log(`  ❌ 报错: ${err.message}`, 'err'); }
    await clearLink(childRecordId);

    // 方式3
    log('', ''); log('【方式3】field.createCell() + table.addRecordByCell()', 'info');
    try {
      const cells: any[] = [];
      if (_textFieldId) {
        const textField = await table.getField(_textFieldId);
        cells.push(await (textField as any).createCell('测试-Cell方式'));
      }
      const linkField = await table.getField(linkFieldId);
      cells.push(await (linkField as any).createCell([parentRecordId]));
      const newId3 = await table.addRecordByCell(cells);
      testRecordIds.push(newId3);
      if (await checkLink(newId3)) _workingMethod = 3;
    } catch (err: any) { log(`  ❌ 报错: ${err.message}`, 'err'); }

    // 方式4
    log('', ''); log('【方式4】table.addRecord({ fields: { linkFieldId: [recordId] } })', 'info');
    try {
      const f4: Record<string, any> = {};
      if (_textFieldId) f4[_textFieldId] = '测试-数组方式';
      f4[linkFieldId] = [parentRecordId];
      const newId4 = await table.addRecord({ fields: f4 });
      testRecordIds.push(newId4);
      if (await checkLink(newId4)) _workingMethod = 4;
    } catch (err: any) { log(`  ❌ 报错: ${err.message}`, 'err'); }

    // 方式5
    log('', ''); log('【方式5】table.addRecord({ fields: { linkFieldId: IOpenLink对象 } })', 'info');
    try {
      const f5: Record<string, any> = {};
      if (_textFieldId) f5[_textFieldId] = '测试-IOpenLink方式';
      f5[linkFieldId] = { text: '', type: 'text', recordIds: [parentRecordId], tableId: _tableId };
      const newId5 = await table.addRecord({ fields: f5 });
      testRecordIds.push(newId5);
      if (await checkLink(newId5)) _workingMethod = 5;
    } catch (err: any) { log(`  ❌ 报错: ${err.message}`, 'err'); }

    log('', ''); log('========== 测试完成 ==========', 'info');
    if (_workingMethod) log(`✅ 推荐使用方式${_workingMethod}`, 'ok');
    else log('❌ 所有方式均失败', 'err');
  } catch (err: any) {
    log(`测试出错: ${err.message}`, 'err');
    console.error(err);
  }
};

// ========== 清理 ==========
(window as any).cleanup = async function () {
  log('--- 清理测试数据 ---', 'info');
  if (testRecordIds.length === 0) { log('没有需要清理的记录', 'info'); return; }
  try {
    const table = await bitable.base.getActiveTable();
    for (const id of testRecordIds) {
      try { await table.deleteRecord(id); log(`已删除: ${id}`, 'ok'); }
      catch (e: any) { log(`删除失败 ${id}: ${e.message}`, 'warn'); }
    }
    testRecordIds = [];
    log('清理完成', 'ok');
  } catch (err: any) { log(`清理失败: ${err.message}`, 'err'); }
};
