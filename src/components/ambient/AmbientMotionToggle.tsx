import * as Tooltip from "@radix-ui/react-tooltip";
import { IconPause, IconPlay } from "../common/Icon";
import { ambientBus } from "./ambientBus";
import { useAmbientBus } from "./useAmbientBus";

/**
 * Header control for the ambient background's motion (WCAG 2.2.2 Pause,
 * Stop, Hide) - always in .header-actions, so it's reachable whatever the
 * sidebar state. Pressed = motion on. A click flips the effective motion;
 * when "Auto" would already give the requested state it goes back to Auto,
 * so the OS reduced-motion setting keeps being followed.
 */
export function AmbientMotionToggle() {
  const { motion, reducedMotion, contrastMore } = useAmbientBus();
  const playing = motion === "live";
  const label = playing ? "Pause ambient motion" : "Resume ambient motion";

  const toggle = () => {
    const want = playing ? "still" : "live";
    const auto = reducedMotion || contrastMore ? "still" : "live";
    ambientBus.setMotionPref(want === auto ? "auto" : want === "live" ? "on" : "off");
  };

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          aria-label="Ambient motion"
          aria-pressed={playing}
          onClick={toggle}
        >
          {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" side="bottom" sideOffset={6}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
