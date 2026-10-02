import { Command } from "cmdk";
import type { JobSummary, ModuleKind } from "../../types/engineering";
import { MODULE_OPTIONS } from "../../constants/modules";
import { IconGrid, IconList, IconKey, IconRefresh, IconLogOut, IconPause, IconPlay } from "../common/Icon";
import type { AmbientMotionPref } from "../../ambient/types";
import { ambientBus } from "../ambient/ambientBus";
import { useAmbientBus } from "../ambient/useAmbientBus";

type Page = "modules" | "jobs";

const MOTION_COMMANDS: Array<{ pref: AmbientMotionPref; label: string }> = [
  { pref: "auto", label: "Ambient motion: Auto" },
  { pref: "on", label: "Ambient motion: On" },
  { pref: "off", label: "Ambient motion: Off" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (page: Page) => void;
  onSelectModule: (module: ModuleKind) => void;
  onSelectJob: (jobId: string) => void;
  onRefresh: () => void;
  onOpenRotateKey: () => void;
  onLogout?: () => void;
  jobs: JobSummary[];
}

/** Global Ctrl+K / Cmd+K quick switcher for engineers who don't want to reach for the mouse. */
export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onSelectModule,
  onSelectJob,
  onRefresh,
  onOpenRotateKey,
  onLogout,
  jobs,
}: CommandPaletteProps) {
  const { motionPref } = useAmbientBus();
  const run = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Palette"
      className="command-palette"
      overlayClassName="command-palette-overlay"
      contentClassName="command-palette-content"
    >
      <Command.Input autoFocus placeholder="Search modules, jobs, actions..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>

        <Command.Group heading="Navigate">
          <Command.Item onSelect={() => run(() => onNavigate("modules"))}>
            <IconGrid size={15} />
            <span>Command Center</span>
          </Command.Item>
          <Command.Item onSelect={() => run(() => onNavigate("jobs"))}>
            <IconList size={15} />
            <span>Jobs Dashboard</span>
          </Command.Item>
          {MODULE_OPTIONS.map((mod) => (
            <Command.Item key={mod.kind} onSelect={() => run(() => onSelectModule(mod.kind))}>
              <mod.icon size={15} />
              <span>Open {mod.title}</span>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Separator />

        <Command.Group heading="Actions">
          <Command.Item onSelect={() => run(onRefresh)}>
            <IconRefresh size={15} />
            <span>Refresh Job Status</span>
          </Command.Item>
          <Command.Item onSelect={() => run(onOpenRotateKey)}>
            <IconKey size={15} />
            <span>Rotate API Key</span>
          </Command.Item>
          {onLogout && (
            <Command.Item onSelect={() => run(onLogout)}>
              <IconLogOut size={15} />
              <span>Sign Out</span>
            </Command.Item>
          )}
          {MOTION_COMMANDS.map(({ pref, label }) => (
            <Command.Item key={pref} onSelect={() => run(() => ambientBus.setMotionPref(pref))}>
              {pref === "off" ? <IconPause size={15} /> : <IconPlay size={15} />}
              <span>{label}</span>
              {motionPref === pref && <span className="command-palette-item-meta">Current</span>}
            </Command.Item>
          ))}
        </Command.Group>

        {jobs.length > 0 && (
          <>
            <Command.Separator />
            <Command.Group heading="Recent Jobs">
              {jobs.slice(0, 20).map((job) => (
                <Command.Item
                  key={job.id}
                  value={`${job.id} ${job.module} ${job.shellId}`}
                  onSelect={() => run(() => onSelectJob(job.id))}
                >
                  <span className="text-mono">{job.id}</span>
                  <span className="command-palette-item-meta">
                    {job.module} · Ø{job.shellId}mm · {job.status}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          </>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
