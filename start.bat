@echo off
chcp 65001 >nul
echo ==========================================
echo   多维表格合并插件 - 启动脚本
echo ==========================================
echo.

echo [1/3] 正在拉取最新代码...
git pull origin main
if %errorlevel% neq 0 (
    echo [错误] 拉取代码失败，请检查网络或git配置
    pause
    exit /b 1
)
echo [✓] 代码已更新
echo.

echo [2/3] 正在安装依赖...
call npm install
if %errorlevel% neq 0 (
    echo [错误] 安装依赖失败
    pause
    exit /b 1
)
echo [✓] 依赖已安装
echo.

echo [3/3] 正在启动开发服务器...
echo [i] 启动完成后，请访问 http://localhost:3000
echo.
npm run dev

pause
