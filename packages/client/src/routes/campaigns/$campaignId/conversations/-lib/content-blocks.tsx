import {
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import type { ContentBlock, ToolStatus } from "./chat-types.js";
import { Markdown } from "./markdown.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";

const TOOL_LABELS: Record<string, string> = {
  getCurrentDateTime: "Get Date/Time",
  getWeather: "Get Weather",
  fetchRandomJoke: "Fetch Joke",
};

const tryFormatJson = (value: string): string => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

const ToolStatusIcon = ({
  status,
}: {
  readonly status: ToolStatus["status"];
}) => {
  switch (status) {
    case "start":
      return <Loader2Icon className="size-3.5 animate-spin text-muted" />;
    case "success":
      return <CheckIcon className="size-3.5 text-success" />;
    case "failure":
      return <XIcon className="size-3.5 text-danger" />;
  }
};

const ToolItemRow = ({ tool }: { readonly tool: ToolStatus }) => (
  <Collapsible className="group/collapsible-tool">
    <CollapsibleTrigger className="flex items-center gap-2">
      <ChevronDownIcon className="size-3.5 -rotate-90 group-data-open/collapsible-tool:rotate-0 transition-transform" />
      <ToolStatusIcon status={tool.status} />
      <span>{TOOL_LABELS[tool.toolName] ?? tool.toolName}</span>
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-1 ml-5 style-lyra:ml-4">
      <div className="pl-6 pb-2 space-y-2 text-xs font-mono">
        <div>
          <span className="text-muted">Input</span>
          <pre className="bg-elevated rounded p-2 mt-1 overflow-x-auto whitespace-pre-wrap">
            {tryFormatJson(tool.input)}
          </pre>
        </div>
        {tool.output !== null && (
          <div>
            <span className="text-muted">Output</span>
            <pre className="bg-elevated rounded p-2 mt-1 overflow-x-auto whitespace-pre-wrap">
              {tryFormatJson(tool.output)}
            </pre>
          </div>
        )}
      </div>
    </CollapsibleContent>
  </Collapsible>
);

const ToolGroupBlock = ({
  tools,
  isStreaming,
}: {
  readonly tools: readonly ToolStatus[];
  readonly isStreaming: boolean;
}) => {
  const anyRunning = tools.some((t) => t.status === "start");
  const allSuccess = tools.every((t) => t.status === "success");
  const anyFailure = tools.some((t) => t.status === "failure");

  return (
    <Collapsible
      defaultOpen={isStreaming || anyRunning}
      className="group/collapsible"
    >
      <CollapsibleTrigger className="flex items-center gap-2">
        <ChevronDownIcon className="size-4 -rotate-90 group-data-open/collapsible:rotate-0 transition-transform" />
        <span>
          {tools.length} {tools.length === 1 ? "step" : "steps"}
        </span>
        {anyRunning && <Loader2Icon className="size-3.5 animate-spin" />}
        {!anyRunning && allSuccess && (
          <CheckIcon className="size-3.5 text-success" />
        )}
        {!anyRunning && anyFailure && (
          <XIcon className="size-3.5 text-danger" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-5 style-lyra:ml-4">
        <div className="pl-4 border-l border-border ml-2">
          {tools.map((tool) => (
            <ToolItemRow key={tool.id} tool={tool} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const ReasoningBlock = ({
  content,
  isStreaming,
}: {
  readonly content: string;
  readonly isStreaming: boolean;
}) => (
  <Collapsible className="group/collapsible">
    <CollapsibleTrigger className="flex items-center gap-2">
      <ChevronDownIcon className="size-4 -rotate-90 group-data-open/collapsible:rotate-0 transition-transform" />
      <ChevronDownIcon className="size-4 -rotate-90 group-data-open/collapsible:rotate-0 transition-transform" />
      <BrainIcon className="size-4" />
      <span>Reasoning</span>
      {isStreaming && <Loader2Icon className="size-3.5 animate-spin" />}
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-1 ml-5 style-lyra:ml-4">
      <Markdown content={content} className="pl-6 pt-2 text-sm text-muted" />
    </CollapsibleContent>
  </Collapsible>
);

export const ContentBlockRenderer = ({
  block,
  isStreaming,
}: {
  readonly block: ContentBlock;
  readonly isStreaming: boolean;
}) => {
  switch (block._tag) {
    case "text": {
      if (!block.content.trim()) return null;
      return <Markdown content={block.content} />;
    }
    case "reasoning":
      return (
        <ReasoningBlock content={block.content} isStreaming={isStreaming} />
      );
    case "tool_group":
      return <ToolGroupBlock tools={block.tools} isStreaming={isStreaming} />;
  }
};
