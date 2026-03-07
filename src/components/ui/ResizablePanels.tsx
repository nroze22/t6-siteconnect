import { Group, Panel, Separator } from "react-resizable-panels";
import { GripVertical } from "lucide-react";

export function ResizablePanelGroup({
  direction,
  className,
  children,
}: {
  direction: "horizontal" | "vertical";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Group orientation={direction} className={className}>
      {children}
    </Group>
  );
}

export function ResizablePanel({
  defaultSize,
  minSize,
  maxSize,
  children,
  className,
}: {
  defaultSize: string;
  minSize?: string;
  maxSize?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Panel
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      className={className}
    >
      {children}
    </Panel>
  );
}

export function ResizableHandle() {
  return (
    <Separator
      style={{ flex: "0 0 4px", cursor: "col-resize", background: "rgba(255,255,255,0.04)" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          width: "100%",
        }}
      >
        <GripVertical
          style={{ width: 10, height: 10, color: "#475569", opacity: 0 }}
          className="group-hover:opacity-100"
        />
      </div>
    </Separator>
  );
}
