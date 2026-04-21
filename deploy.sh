#!/bin/bash
# ============================================
# 飞书多维表格合并插件 - 一键部署脚本
# ============================================
# 使用方法：
#   1. 将整个 bitable-merge-plugin 目录上传到服务器
#   2. 执行：bash deploy.sh
#   3. 按提示操作
# ============================================

set -e

# 配置区域（按需修改）
APP_NAME="bitable-merge-plugin"
DEPLOY_DIR="/var/www/${APP_NAME}"
NGINX_CONF="/etc/nginx/conf.d/${APP_NAME}.conf"
PORT=8080

echo "=========================================="
echo "  飞书多维表格合并插件 - 部署脚本"
echo "=========================================="
echo ""

# 检查是否 root
if [ "$EUID" -ne 0 ]; then
  echo "⚠️  建议使用 root 权限运行（部分操作需要 sudo）"
fi

# 步骤1：安装依赖
echo ""
echo "📦 [1/5] 检查环境..."
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，正在安装..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "✅ Node.js: $(node -v)"
echo "✅ npm: $(npm -v)"

# 步骤2：安装项目依赖并构建
echo ""
echo "🔨 [2/5] 构建项目..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ]; then
    npm install
fi
npm run build
echo "✅ 构建完成，产物在 dist/ 目录"

# 步骤3：部署到目标目录
echo ""
echo "📂 [3/5] 部署文件到 ${DEPLOY_DIR}..."
mkdir -p "${DEPLOY_DIR}"
cp -r dist/* "${DEPLOY_DIR}/"
echo "✅ 文件已复制到 ${DEPLOY_DIR}"

# 步骤4：配置 Nginx
echo ""
echo "🌐 [4/5] 配置 Nginx..."
if command -v nginx &> /dev/null; then
    cat > "${NGINX_CONF}" << EOF
server {
    listen ${PORT};
    server_name _;

    root ${DEPLOY_DIR};
    index index.html;

    # 开启 gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    # 静态资源缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA 路由
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # 安全头
    add_header X-Frame-Options "ALLOWALL";
    add_header X-Content-Type-Options "nosniff";
}
EOF
    echo "✅ Nginx 配置已写入 ${NGINX_CONF}"

    # 测试并重载 Nginx
    nginx -t && systemctl reload nginx
    echo "✅ Nginx 已重载"
else
    echo "⚠️  未检测到 Nginx，跳过配置"
    echo "   您可以手动配置 Web 服务器指向 ${DEPLOY_DIR}"
    echo "   或使用以下命令快速启动一个静态服务器："
    echo "   cd ${DEPLOY_DIR} && npx serve -l ${PORT}"
fi

# 步骤5：显示结果
echo ""
echo "🎉 [5/5] 部署完成！"
echo ""
echo "=========================================="
echo "  部署信息"
echo "=========================================="
echo ""
echo "  📁 部署目录: ${DEPLOY_DIR}"
if command -v nginx &> /dev/null; then
    echo "  🌐 访问地址: http://<您的服务器IP>:${PORT}"
    echo "  ⚙️  Nginx配置: ${NGINX_CONF}"
fi
echo ""
echo "  📋 下一步操作："
echo "  1. 确保服务器防火墙开放了 ${PORT} 端口"
echo "  2. 在飞书多维表格中："
echo "     点击右上角「插件」→「自定义插件」→「+ 新增插件」"
echo "     服务地址填写: http://<您的服务器IP>:${PORT}"
echo ""
echo "  ⚠️  注意：飞书生产环境要求 HTTPS"
echo "     建议配置 SSL 证书（可用 Let's Encrypt 免费证书）"
echo ""
