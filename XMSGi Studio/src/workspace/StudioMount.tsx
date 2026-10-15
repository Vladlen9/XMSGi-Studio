import { Suspense, lazy, useMemo, useRef } from 'react';
import type { StudioBridgeProps, StudioSchedulerActions, StudioSchedulerRuntime } from '@shared/bridge';
import { preloadStudioApp } from './studioLoader';

const StudioApp = lazy(preloadStudioApp);

type StudioMountProps = Required<Pick<StudioBridgeProps, 'connected' | 'activeAccountId' | 'chats' | 'scheduler'>>
  & Pick<StudioBridgeProps,
    | 'onRegisterPlannerTextOpener'
    | 'onRegisterHistoryDraftOpener'
    | 'onRegisterHistoryDraftUseHandler'
    | 'onRegisterHistoryDraftClearHandler'
    | 'onRegisterHistoryDraftDeleteHandler'
    | 'onRegisterHistoryRescheduleHandler'
  >;

type StudioSchedulerHandlers = Pick<StudioSchedulerActions,
  | 'handleSchedule'
  | 'handleSendDraftNow'
  | 'handleSendNow'
  | 'handleDeleteMessage'
  | 'handleClearSent'
  | 'handleCancelMessage'
  | 'handleCancelMessages'
>;

function useStableSchedulerRuntime(scheduler: StudioSchedulerRuntime): StudioSchedulerRuntime {
  const schedulerRef = useRef(scheduler);
  schedulerRef.current = scheduler;
  const actions = useMemo<StudioSchedulerHandlers>(() => ({
    handleSchedule: (...args) => schedulerRef.current.handleSchedule(...args),
    handleSendDraftNow: (...args) => schedulerRef.current.handleSendDraftNow(...args),
    handleSendNow: (...args) => schedulerRef.current.handleSendNow(...args),
    handleDeleteMessage: (...args) => schedulerRef.current.handleDeleteMessage(...args),
    handleClearSent: (...args) => schedulerRef.current.handleClearSent(...args),
    handleCancelMessage: (...args) => schedulerRef.current.handleCancelMessage(...args),
    handleCancelMessages: (...args) => schedulerRef.current.handleCancelMessages(...args),
  }), []);

  return useMemo(() => ({
    protocolVersion: scheduler.protocolVersion,
    ...actions,
    upcoming: scheduler.upcoming,
    sent: scheduler.sent,
    scheduling: scheduler.scheduling,
    successPulse: scheduler.successPulse,
    lastAction: scheduler.lastAction,
    revealingId: scheduler.revealingId,
    cancelingIds: scheduler.cancelingIds,
    sendingIds: scheduler.sendingIds,
    publishingDraft: scheduler.publishingDraft,
    notification: scheduler.notification,
    closeNotification: () => schedulerRef.current.closeNotification(),
  }), [
    actions,
    scheduler.protocolVersion,
    scheduler.upcoming,
    scheduler.sent,
    scheduler.scheduling,
    scheduler.successPulse,
    scheduler.lastAction,
    scheduler.revealingId,
    scheduler.cancelingIds,
    scheduler.sendingIds,
    scheduler.publishingDraft,
    scheduler.notification,
  ]);
}

export function StudioMount({ connected, activeAccountId, chats, scheduler, onRegisterPlannerTextOpener, onRegisterHistoryDraftOpener, onRegisterHistoryDraftUseHandler, onRegisterHistoryDraftClearHandler, onRegisterHistoryDraftDeleteHandler, onRegisterHistoryRescheduleHandler }: StudioMountProps) {
  const stableScheduler = useStableSchedulerRuntime(scheduler);

  return (
    <Suspense fallback={null}>
      <StudioApp
        connected={connected}
        activeAccountId={activeAccountId}
        chats={chats}
        scheduler={stableScheduler}
        onRegisterPlannerTextOpener={onRegisterPlannerTextOpener}
        onRegisterHistoryDraftOpener={onRegisterHistoryDraftOpener}
        onRegisterHistoryDraftUseHandler={onRegisterHistoryDraftUseHandler}
        onRegisterHistoryDraftClearHandler={onRegisterHistoryDraftClearHandler}
        onRegisterHistoryDraftDeleteHandler={onRegisterHistoryDraftDeleteHandler}
        onRegisterHistoryRescheduleHandler={onRegisterHistoryRescheduleHandler}
      />
    </Suspense>
  );
}