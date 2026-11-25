"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
  type RefObject,
} from "react";
import { cn } from "@/lib/cn";

type PopoverContextValue = {
  open: boolean;
  toggle: () => void;
  close: () => void;
  contentId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopover(): PopoverContextValue {
  const context = useContext(PopoverContext);
  if (!context) throw new Error("Popover の中で使ってください");
  return context;
}

/**
 * ボタンで開閉する浮いた枠。外側を押す・Escape・中のリンクを押すと閉じる。
 * 中身の位置は、この要素（relative）を基準に PopoverContent の align で決める
 */
export function Popover({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: globalThis.MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <PopoverContext.Provider
      value={{ open, toggle, close, contentId, triggerRef }}
    >
      <div ref={rootRef} className={cn("relative", className)} {...props}>
        {children}
      </div>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, toggle, contentId, triggerRef } = usePopover();
  return (
    <button
      ref={triggerRef}
      type="button"
      aria-expanded={open}
      aria-controls={contentId}
      onClick={(event) => {
        onClick?.(event);
        toggle();
      }}
      {...props}
    />
  );
}

/** Popover の中で、開いているかを知る（開閉に合わせてボタンの文言・アイコンを変えるとき） */
export function usePopoverOpen(): boolean {
  return usePopover().open;
}

const ALIGN = {
  // ボタンの右端にそろえて、その下に浮かせる（アカウントのメニュー・仕入れ枠の内訳）
  end: "right-0 top-[calc(100%+12px)] rounded-2xl border border-neutral-200 bg-white shadow-[0_20px_40px_-20px_color-mix(in_srgb,var(--color-neutral-900)_35%,transparent)]",
  // 基準の要素の幅いっぱいに、その下に出す（スマホ幅のメニュー）
  full: "inset-x-0 top-full",
} as const;

export function PopoverContent({
  align = "end",
  className,
  onClick,
  ...props
}: HTMLAttributes<HTMLDivElement> & { align?: keyof typeof ALIGN }) {
  const { open, close, contentId } = usePopover();
  if (!open) return null;
  return (
    <div
      id={contentId}
      className={cn("absolute z-30", ALIGN[align], className)}
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        onClick?.(event);
        // 会員の画面ではレイアウトが残ったまま画面が移るため、リンクを押したら閉じる
        if ((event.target as Element).closest("a")) close();
      }}
      {...props}
    />
  );
}
