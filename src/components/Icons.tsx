import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  title?: string;
};

function IconBase({
  children,
  size = 20,
  title,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function NestCamIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4.5 15.5c2.1-5.2 6.6-8 12.8-8.4" />
      <path d="M6.1 13.3c2.7-.4 5.1.5 7.2 2.7" />
      <path d="M13.5 7.3c1.1 1.2 1.7 2.6 1.7 4.1 0 3.1-2.6 5.6-5.8 5.6H4.8" />
      <path d="M17.3 7.1l2.2-1.5.5 2.5" />
      <circle cx="9.3" cy="9.9" r=".7" fill="currentColor" stroke="none" />
      <path d="M3.5 19.2h17" />
    </IconBase>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4.2 8.2h3l1.5-2h6.6l1.5 2h3a1.6 1.6 0 0 1 1.6 1.6v7.5a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6V9.8a1.6 1.6 0 0 1 1.6-1.6Z" />
      <circle cx="12" cy="13.4" r="3.3" />
      <path d="M18.1 10.4h.1" />
    </IconBase>
  );
}

export function SheetIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 3.7h8.3L18 7.4v12.9H6V3.7Z" />
      <path d="M14.1 3.8v3.9h3.8" />
      <path d="M8.8 11h6.4" />
      <path d="M8.8 14h6.4" />
      <path d="M8.8 17h3.8" />
    </IconBase>
  );
}

export function SyncIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M18.5 8.3A7 7 0 0 0 6 6.9L4.5 8.6" />
      <path d="M4.4 4.9v3.8h3.8" />
      <path d="M5.5 15.7A7 7 0 0 0 18 17.1l1.5-1.7" />
      <path d="M19.6 19.1v-3.8h-3.8" />
    </IconBase>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 16.5V4.8" />
      <path d="m7.9 8.9 4.1-4.1 4.1 4.1" />
      <path d="M5.2 15.5v2.9c0 .9.7 1.6 1.6 1.6h10.4c.9 0 1.6-.7 1.6-1.6v-2.9" />
    </IconBase>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14.8 5.2 8 12l6.8 6.8" />
    </IconBase>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9.2 5.2 16 12l-6.8 6.8" />
    </IconBase>
  );
}

export function StartIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m10 8.7 5 3.3-5 3.3V8.7Z" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function EndIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.2 9.2h5.6v5.6H9.2z" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function SingleImageIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2.2" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m6.8 16 4.1-4 2.8 2.7 1.5-1.5 2 2.8" />
    </IconBase>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m5.2 12.4 4.1 4.1 9.5-9.2" />
    </IconBase>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 7.3h14" />
      <path d="M9 7.3V5.5h6v1.8" />
      <path d="m7.1 9.2.7 10.1h8.4l.7-10.1" />
      <path d="M10.2 11.5v5" />
      <path d="M13.8 11.5v5" />
    </IconBase>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4.6 19.4h4.1l10-10a2.4 2.4 0 0 0-3.4-3.4l-10 10-.7 3.4Z" />
      <path d="m13.8 7.5 2.7 2.7" />
    </IconBase>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8.2 8.3H4.6V4.7" />
      <path d="M4.8 8.1a8.2 8.2 0 1 1 2 8.4" />
    </IconBase>
  );
}

export function ServerIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="4.8" width="16" height="5.8" rx="1.4" />
      <rect x="4" y="13.4" width="16" height="5.8" rx="1.4" />
      <path d="M7.2 7.7h.1" />
      <path d="M7.2 16.3h.1" />
      <path d="M11 7.7h5.8" />
      <path d="M11 16.3h5.8" />
    </IconBase>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8.4 4.8H4.8v3.6" />
      <path d="M4.8 4.8 10 10" />
      <path d="M15.6 4.8h3.6v3.6" />
      <path d="M19.2 4.8 14 10" />
      <path d="M8.4 19.2H4.8v-3.6" />
      <path d="M4.8 19.2 10 14" />
      <path d="M15.6 19.2h3.6v-3.6" />
      <path d="M19.2 19.2 14 14" />
    </IconBase>
  );
}

export function InstallIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7.4 4.8h9.2c.9 0 1.6.7 1.6 1.6v11.2c0 .9-.7 1.6-1.6 1.6H7.4c-.9 0-1.6-.7-1.6-1.6V6.4c0-.9.7-1.6 1.6-1.6Z" />
      <path d="M9.2 15.8h5.6" />
      <path d="M12 8.2v5" />
      <path d="m9.8 11 2.2 2.2 2.2-2.2" />
    </IconBase>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4.1 21 19H3L12 4.1Z" />
      <path d="M12 9.3v4.2" />
      <path d="M12 16.8h.1" />
    </IconBase>
  );
}
