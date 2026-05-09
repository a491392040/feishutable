#!/bin/bash
# ============================================
# 飞书多维表格合并插件 - Docker 一键部署/更新脚本
# ============================================
# 使用方法：
#   首次部署：bash redeploy.sh
#   后续更新：bash redeploy.sh
# ============================================

set -e

IMAGE_NAME="bitable-merge-plugin"
CONTAINER_NAME="bitable-merge-plugin"
PORT=8080

echo "=========================================="
echo "  飞书多维表格合并插件 - Docker 部署"
echo "=========================================="
echo ""

# 拉取最新代码
echo "📦 [1/4] 拉取最新代码..."
git pull
echo "✅ 代码已更新"
echo ""

# 构建镜像
echo "🔨 [2/4] 构建 Docker 镜像..."
docker build --no-cache -t ${IMAGE_NAME} .
echo "✅ 镜像构建完成"
echo ""

# 停止并移除旧容器（如果存在）
echo "🔄 [3/4] 更新容器..."
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    docker stop ${CONTAINER_NAME} 2>/dev/null || true
    docker rm ${CONTAINER_NAME} 2>/dev/null || true
    echo "✅ 旧容器已移除"
else
    echo "✅ 无旧容器，跳过"
fi

# 启动新容器
docker run -d \
    --name ${CONTAINER_NAME} \
    --restart unless-stopped \
    -p ${PORT}:80 \
    ${IMAGE_NAME}

echo "✅ 容器已启动"
echo ""

# 显示结果
echo "🎉 [4/4] 部署完成！"
echo ""
echo "=========================================="
echo "  部署信息"
echo "=========================================="
echo ""
echo "  🌐 访问地址: http://<服务器IP>:${PORT}"
echo "  📁 容器名称: ${CONTAINER_NAME}"
echo "  🖼️  镜像名称: ${IMAGE_NAME}"
echo ""
echo "  📋 常用命令："
echo "    查看日志: docker logs -f ${CONTAINER_NAME}"
echo "    停止容器: docker stop ${CONTAINER_NAME}"
echo "    启动容器: docker start ${CONTAINER_NAME}"
echo "    重启容器: docker restart ${CONTAINER_NAME}"
echo ""
echo "  ⚠️  飞书插件配置："
echo "    多维表格 → 插件 → 自定义插件 → 新增插件"
echo "    服务地址填写: http://<服务器IP>:${PORT}"
echo "    注意：飞书生产环境要求 HTTPS，建议前置 SSL 反代"
echo ""
