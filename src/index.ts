/**
 * NapCat 插件模板 - 主入口
 *
 * 导出 PluginModule 接口定义的生命周期函数，NapCat 加载插件时会调用这些函数。
 *
 * 生命周期：
 *   plugin_init        → 插件加载时调用（必选）
 *   plugin_onmessage   → 收到事件时调用（需通过 post_type 判断事件类型）
 *   plugin_onevent     → 收到所有 OneBot 事件时调用
 *   plugin_cleanup     → 插件卸载/重载时调用
 *
 * 配置相关：
 *   plugin_config_ui          → 导出配置 Schema，用于 WebUI 自动生成配置面板
 *   plugin_get_config         → 自定义配置读取
 *   plugin_set_config         → 自定义配置保存
 *   plugin_on_config_change   → 配置变更回调
 *
 * @author Your Name
 * @license MIT
 */

import type {
    PluginModule,
    PluginConfigSchema,
    PluginConfigUIController,
    NapCatPluginContext,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { EventType } from 'napcat-types/napcat-onebot/event/index';
import * as net from 'net';

import { buildConfigSchema } from './config';
import { pluginState } from './core/state';
import { handleMessage } from './handlers/message-handler';
import { registerApiRoutes } from './services/api-service';
import type { PluginConfig } from './types';



// const remoteList = [
//     { host: 'vip.cd.frp.one' },
//     { host: 'vip.nb.3.frp.one'}
// ];

// const remoteListName = [
//     { name: '宁波多线'},
// ];

// const catchAPI = fetch(`https://cf-v2.uapis.cn/nodeinfo?token=0O7cjgyEELI1c5jXrfiZMcC7&node=${remoteListName[0].name}`)
//     .then(res => res.json())

// ==================== 配置 UI Schema ====================

/** NapCat WebUI 读取此导出来展示配置面板 */
export let plugin_config_ui: PluginConfigSchema = [];

// ==================== 生命周期函数 ====================

/**
 * 插件初始化（必选）
 * 加载配置、注册 WebUI 路由和页面
 */
export const plugin_init: PluginModule['plugin_init'] = async (ctx) => {
    try {
        // 1. 初始化全局状态（加载配置）
        pluginState.init(ctx);

        ctx.logger.info('插件初始化中...');

        // 2. 生成配置 Schema（用于 NapCat WebUI 配置面板）
        plugin_config_ui = buildConfigSchema(ctx);

        // 3. 注册 WebUI 页面和静态资源
        registerWebUI(ctx);

        // 4. 注册 API 路由
        registerApiRoutes(ctx);

        ctx.logger.info('插件初始化完成');
    } catch (error) {
        ctx.logger.error('插件初始化失败:', error);
    }
};

/**
 * 消息/事件处理（可选）
 * 收到事件时调用，需通过 post_type 判断是否为消息事件
 */
export const plugin_onmessage: PluginModule['plugin_onmessage'] = async (ctx, event) => {
    // 仅处理消息事件
    if (event.post_type !== EventType.MESSAGE) return;
    // 检查插件是否启用
    if (!pluginState.config.enabled) return;
    // if (event.raw_message === '噔噔') {
    //     await ctx.actions.call('send_msg', {
    //         message: '酱酱',
    //         message_type: event.message_type,
    //         group_id: event.group_id,
    //         user_id: event.user_id,
    //     }, ctx.adapterName, ctx.pluginManager.config);
    //     return;
    // }
    // 利用TCP检测远程服务器是否在线
    if (event.raw_message.startsWith('ping ')) {
        try {
            const input = event.raw_message.substring('ping '.length).trim();
            if (input === 'help') {
                await ctx.actions.call('send_msg', {
                    message: 'ping <IP地址[:端口]> 或 ping <节点名称> 或 ping <节点名称> <端口号>\n例如：ping 8.8.8.8 或 ping 宁波多线 或 ping 宁波多线 25565',
                    message_type: event.message_type,
                    group_id: event.group_id,
                    user_id: event.user_id,
                }, ctx.adapterName, ctx.pluginManager.config);
                return;
            }
            
            // 检查是否包含空格，用于判断是否有自定义端口
            const parts = input.split(' ');
            const nodeName = parts[0]; // 只取节点名称部分用于API查询
            
            // 首先尝试从API获取服务器信息
            const apiResponse = await fetch(`https://cf-v2.uapis.cn/nodeinfo?token=${process.env.TOKEN}&node=${nodeName}`)
                .then(res => res.json())
                .catch(() => null);
            
            let host: string;
            let port: number = 80; // 默认端口为80
            
            // 如果API返回成功并且包含real_IP，则使用API返回的IP
            if (apiResponse && apiResponse.code === 200 && apiResponse.data && apiResponse.data.real_IP) {
                host = apiResponse.data.real_IP; // real_IP是一个字符串，直接使用
                
                // 检查是否有额外的端口参数
                if (parts.length > 1) {
                    const customPort = parseInt(parts[1]);
                    if (isNaN(customPort) || customPort <= 0 || customPort > 65535) {
                        await ctx.actions.call('send_msg', {
                            message: '端口号必须是1-65535之间的有效数字',
                            message_type: event.message_type,
                            group_id: event.group_id,
                            user_id: event.user_id,
                        }, ctx.adapterName, ctx.pluginManager.config);
                        return;
                    }
                    port = customPort;
                } else {
                    // 如果没有指定端口，使用API返回的端口
                    if (apiResponse.data.port) {
                        port = apiResponse.data.port;
                    }
                }
            } else {
                // API调用失败，解析输入的IP和端口（保持原有逻辑）
                if (input.includes(':')) {
                    const colonParts = input.split(':');
                    host = colonParts[0];
                    port = parseInt(colonParts[1]);
                    if (isNaN(port) || port <= 0 || port > 65535) {
                        await ctx.actions.call('send_msg', {
                            message: '端口号必须是1-65535之间的有效数字',
                            message_type: event.message_type,
                            group_id: event.group_id,
                            user_id: event.user_id,
                        }, ctx.adapterName, ctx.pluginManager.config);
                        return;
                    }
                } else {
                    host = input;
                }
            }
            
            // 验证主机名/IP格式
            if (!host) {
                await ctx.actions.call('send_msg', {
                    message: '请提供要检测的服务器IP或域名，格式：ping <IP地址[:端口]> 或 ping <节点名称> 或 ping <节点名称> <端口号>，例如：ping 8.8.8.8 或 ping 宁波多线 或 ping 宁波多线 25565',
                    message_type: event.message_type,
                    group_id: event.group_id,
                    user_id: event.user_id,
                }, ctx.adapterName, ctx.pluginManager.config);
                return;
            }
            
            // 创建TCP连接测试
            const tcpTest = new Promise<boolean>((resolve) => {
                const socket = new net.Socket();
                
                const timeout = setTimeout(() => {
                    socket.destroy();
                    resolve(false);
                }, 5000); // 5秒超时
                
                socket.setTimeout(5000);
                
                socket.on('connect', () => {
                    clearTimeout(timeout);
                    socket.destroy();
                    resolve(true);
                });
                
                socket.on('error', () => {
                    clearTimeout(timeout);
                    socket.destroy();
                    resolve(false);
                });
                
                socket.on('timeout', () => {
                    clearTimeout(timeout);
                    socket.destroy();
                    resolve(false);
                });
                
                socket.connect(port, host);
            });
            
            const isConnected = await tcpTest;
            
            if (isConnected) {
                ctx.logger.info(`${host}:${port} 服务器在线`);
            } else {
                ctx.logger.warn(`${host}:${port} 服务器离线或无法连接`);
            }
            
            await ctx.actions.call('send_msg', {
                message: `对方服务器状态: ${isConnected ? '在线' : '离线或无法连接'}`,
                message_type: event.message_type,
                group_id: event.group_id,
                user_id: event.user_id,
            }, ctx.adapterName, ctx.pluginManager.config);
        }
        
        catch (error: unknown) {
            let message = '检测服务器时出错';
            if (error instanceof Error) {
                message += `: ${error.message}`;
            }
            await ctx.actions.call('send_msg', {
                message,
                message_type: event.message_type,
                group_id: event.group_id,
                user_id: event.user_id,
            }, ctx.adapterName, ctx.pluginManager.config);
        }
    }
    
    // 委托给消息处理器
    await handleMessage(ctx, event);
};

/**
 * 事件处理（可选）
 * 处理所有 OneBot 事件（通知、请求等）
 */
export const plugin_onevent: PluginModule['plugin_onevent'] = async (ctx, event) => {
    // TODO: 在这里处理通知、请求等非消息事件
    // 示例：
    // if (event.post_type === EventType.NOTICE) { ... }
    // if (event.post_type === EventType.REQUEST) { ... }
};

/**
 * 插件卸载/重载（可选）
 * 必须清理定时器、关闭连接等资源
 */
export const plugin_cleanup: PluginModule['plugin_cleanup'] = async (ctx) => {
    try {
        // TODO: 在这里清理你的资源（定时器、WebSocket 连接等）
        pluginState.cleanup();
        ctx.logger.info('插件已卸载');
    } catch (e) {
        ctx.logger.warn('插件卸载时出错:', e);
    }
};

// ==================== 配置管理钩子 ====================

/** 获取当前配置 */
export const plugin_get_config: PluginModule['plugin_get_config'] = async (ctx) => {
    return pluginState.config;
};

/** 设置配置（完整替换，由 NapCat WebUI 调用） */
export const plugin_set_config: PluginModule['plugin_set_config'] = async (ctx, config) => {
    pluginState.replaceConfig(config as PluginConfig);
    ctx.logger.info('配置已通过 WebUI 更新');
};

/**
 * 配置变更回调
 * 当 WebUI 中修改单个配置项时触发（需配置项标记 reactive: true）
 */
export const plugin_on_config_change: PluginModule['plugin_on_config_change'] = async (
    ctx, ui, key, value, currentConfig
) => {
    try {
        pluginState.updateConfig({ [key]: value });
        ctx.logger.debug(`配置项 ${key} 已更新`);
    } catch (err) {
        ctx.logger.error(`更新配置项 ${key} 失败:`, err);
    }
};

// ==================== 内部函数 ====================

/**
 * 注册 WebUI 页面和静态资源
 */
function registerWebUI(ctx: NapCatPluginContext): void {
    const router = ctx.router;

    // 托管前端静态资源（构建产物在 webui/ 目录下）
    // 访问路径: /plugin/<plugin-id>/files/static/
    router.static('/static', 'webui');

    // 注册仪表盘页面（显示在 NapCat WebUI 侧边栏）
    // 访问路径: /plugin/<plugin-id>/page/dashboard
    router.page({
        path: 'dashboard',
        title: '插件仪表盘',
        htmlFile: 'webui/index.html',
        description: '插件管理控制台',
    });

    ctx.logger.debug('WebUI 路由注册完成');
}