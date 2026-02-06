/**
 * BellePoule Modern - Modal Resize Hook
 * Licensed under GPL-3.0
 */
interface UseModalResizeOptions {
    defaultWidth?: number;
    defaultHeight?: number;
    minWidth?: number;
    minHeight?: number;
}
export declare const useModalResize: (options?: UseModalResizeOptions) => {
    modalRef: import("react").RefObject<HTMLDivElement | null>;
    dimensions: {
        width: number;
        height: number;
    };
    isResizing: boolean;
    setIsResizing: import("react").Dispatch<import("react").SetStateAction<boolean>>;
};
export {};
//# sourceMappingURL=useModalResize.d.ts.map