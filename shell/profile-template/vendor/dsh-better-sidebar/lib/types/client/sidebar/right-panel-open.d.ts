/**
 * 跟踪宿主右侧面板的展开态。
 * @returns 展开时为 true（首帧同步读取，之后每 500ms 复核一次）。
 */
export declare function useRightPanelOpen(): boolean;
