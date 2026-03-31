# VisionGenie Beta 测试启动说明

本说明面向测试人员和评审老师，用于启动 `Beta` 版 Android 程序并跑通核心演示链路。

## 1. 交付内容

- Beta 安装包：`deliverables/VisionGenie-Beta-debug.apk`
- Android 原始输出：`android/app/build/outputs/apk/debug/app-debug.apk`
- App 包名：`com.visiongenieapp`

当前交付的是 `debug apk`，因此启动 App 时仍需要本地前端调试服务和后端服务。

## 2. 推荐测试环境

- Windows 10 / 11
- Node.js `22.11.0` 或更高
- npm
- Android Studio 或至少安装 `adb`
- 1 台 Android 真机，已开启 USB 调试

## 3. 必须准备的配置

仓库中只提供模板文件 `backend/.env.example`，不包含真实密钥。

测试前必须准备好：

1. 将 `backend/.env.example` 复制为 `backend/.env`
2. 填入真实可用的配置，至少包括：
   - 调色模型：`MODEL_API_KEY`、`MODEL_BASE_URL`、`MODEL_PRIMARY_NAME`
   - 语音转写：`ASR_API_KEY`
   - 2D 转 3D：`TRIPO_SECRET_KEY`
   - 登录鉴权：`JWT_SECRET`

如果没有可用的 `backend/.env`，App 会出现：

- AI 首轮调色失败
- 语音精修失败
- 2D 转 3D 不可用

## 4. 需要启动的服务

### 必开服务

1. React Native Metro 前端服务
2. Node 后端网关服务

### 可选服务

1. Web 社区页面
   - 仅在需要打开浏览器访问社区 Web 端时启动
   - 地址为 `http://127.0.0.1:4020`

## 5. 启动步骤

以下命令均以 PowerShell 为例，工作目录默认是仓库根目录：

`E:\GitHub_VisionGenie\ruanjianchuangxin-1`

### 步骤 1：安装依赖

首次启动时执行：

```powershell
npm install
cd backend
npm install
cd ..
cd web
npm install
cd ..
```

### 步骤 2：启动后端服务

打开第一个终端：

```powershell
cd E:\GitHub_VisionGenie\ruanjianchuangxin-1
npm run backend:start
```

正常情况下后端监听：

- `http://127.0.0.1:8787`

### 步骤 3：启动前端 Metro

打开第二个终端：

```powershell
cd E:\GitHub_VisionGenie\ruanjianchuangxin-1
npm run start
```

正常情况下 Metro 监听：

- `http://127.0.0.1:8081`

### 步骤 4：连接 Android 真机

确保手机已开启 USB 调试，然后执行：

```powershell
adb devices
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8787 tcp:8787
```

如果 `adb devices` 能看到设备序列号，说明真机已连接成功。

### 步骤 5：安装 Beta APK

```powershell
adb install -r E:\GitHub_VisionGenie\ruanjianchuangxin-1\deliverables\VisionGenie-Beta-debug.apk
```

如果已经安装过旧版本，也可以直接覆盖安装。

### 步骤 6：启动 App

```powershell
adb shell am start -n com.visiongenieapp/.MainActivity
```

## 6. 可选：启动 Web 社区

如果需要同时演示浏览器中的社区页面，再打开第三个终端：

```powershell
cd E:\GitHub_VisionGenie\ruanjianchuangxin-1\web
npm run dev
```

启动后访问：

- `http://127.0.0.1:4020`

## 7. 启动完成后的检查方法

### 检查前端服务

浏览器打开：

- `http://127.0.0.1:8081`

能看到 Metro 页面或返回内容即可。

### 检查后端服务

浏览器打开以下地址：

- `http://127.0.0.1:8787/v1/modules/color/health`
- `http://127.0.0.1:8787/v1/modules/agent/health`

如果返回 JSON，说明核心服务已启动。

说明：

- `http://127.0.0.1:8787/v1/modules/health` 在 Tripo 网络不可达时可能返回 `503`
- 这不一定代表整个 App 不可用
- 创作调色、Agent、社区主链路通常仍可演示

## 8. 推荐演示顺序

建议测试人员按下面顺序体验：

1. 打开 App，进入注册 / 登录页
2. 进入“创作”页，选择图片
3. 测试风格预设、AI 首轮调色、保存图片
4. 进入“Agent”页，输入：
   - `把这张照片调色好后发送到社区`
5. 查看 Agent 计划、策略、结果卡片、工具摘要
6. 打开悬浮 Hiyori，再说同样的指令
7. 进入“社区”页确认发布结果
8. 如需测试“模型”页，再尝试 2D 转 3D

## 9. 已知说明

### 1. 为什么必须同时开两个服务

因为当前提交的是 `debug apk`：

- `Metro` 负责给 App 提供前端 JS Bundle
- `backend` 负责调色、Agent、账号、社区、建模等接口

缺少任意一个，App 都无法正常完整运行。

### 2. 2D 转 3D 为什么可能失败

模型功能依赖 Tripo 云端网络和真实密钥。

如果当前电脑无法访问 Tripo 云端，可能出现：

- 建模模块降级
- 任务创建失败
- 无法返回真实 3D 资产

这类情况不影响创作、Agent、社区的主体测试。

### 3. Web 社区是否是必需的

不是必需的。

Android App 内已经包含社区相关功能，只有在需要浏览器演示 Web 社区时，才需要额外启动 `web` 服务。

## 10. 常用命令速查

```powershell
# 仓库根目录
cd E:\GitHub_VisionGenie\ruanjianchuangxin-1

# 后端
npm run backend:start

# Metro
npm run start

# Web 社区（可选）
cd web
npm run dev

# 真机端口转发
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8787 tcp:8787

# 安装 APK
adb install -r E:\GitHub_VisionGenie\ruanjianchuangxin-1\deliverables\VisionGenie-Beta-debug.apk

# 启动 App
adb shell am start -n com.visiongenieapp/.MainActivity
```
