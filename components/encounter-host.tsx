'use client';

import { Component, useEffect, useRef, type ReactNode } from 'react';
import type { MinigameDefinition, MinigameProps } from '@/minigames/contract';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

class EncounterBoundary extends Component<{ children: ReactNode; cancel: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="alert"><p>The encounter could not start.</p><button onClick={this.props.cancel}>Return to board</button></div> : this.props.children;
  }
}

/** Key by run/floor/cell so each launch gets its own completion guard. */
export default function EncounterHost({ definition, context, complete, cancel }: MinigameProps & { definition?: MinigameDefinition }) {
  const settled = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const once = (action: () => void) => {
    if (!active.current || settled.current) return;
    settled.current = true;
    action();
  };
  const props: MinigameProps = {
    context,
    complete: result => {
      if (result?.outcome === 'success' || result?.outcome === 'failure') once(() => complete(result));
    },
    cancel: () => once(cancel),
  };
  const Game = definition?.Component;
  return <Dialog open onOpenChange={open => { if (!open) props.cancel(); }}><DialogContent className="encounter" showCloseButton={false}>
    <DialogTitle>{definition?.title ?? 'Encounter harness'}</DialogTitle>
    <EncounterBoundary cancel={props.cancel}>
      {Game ? <Game {...props} /> : <>
        <p>No minigame registered yet. These controls test the shared result flow.</p>
        <div className="harness-actions">
          <button autoFocus onClick={() => props.complete({ outcome: 'success' })}>Simulate success</button>
          <button onClick={() => props.complete({ outcome: 'failure' })}>Simulate failure</button>
        </div>
      </>}
    </EncounterBoundary>
    <button className="harness-cancel" onClick={props.cancel}>Return to board</button>
  </DialogContent></Dialog>;
}
