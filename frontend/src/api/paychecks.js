import client from './client';
import * as demo from './demoStore'
import { cachedGet } from './offline/cache';
import { offlineCreate, offlineUpdate, offlineDelete } from './offline/mutate';



// GET endpoints read through the offline cache (#204): last-known response is
// returned immediately and refreshed underneath, so a cold-starting or
// unreachable backend doesn't leave the UI on skeletons.
//
// create/update/delete are offline-capable too, same pattern as
// api/transactions.js: try the network, queue + apply optimistically only on
// an unreachable-shaped failure.
//
// Only paycheck SCHEDULES (create/update/delete) fit the list-CRUD shape
// mutate.js expects. Everything else here is a single derived/aggregate
// value, not a list row, so optimistic list-merge doesn't apply and these
// stay network-only: updatePaycheckAmount (edits one paycheck inside the
// {paychecks, pending_paychecks} shape getPaychecks returns, not a flat
// list), setBalanceAnchor/setSpendingReserve (singleton PUT/PATCH), and the
// read-only surplus/savings/running-balance projections.

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getPaycheckSchedules   = ()          => isDemo() ? demo.getPaycheckSchedules()           : cachedGet('paycheckSchedules', () => client.get('/paychecks/schedules'));
export const createPaycheckSchedule = (data)      => isDemo() ? demo.createPaycheckSchedule(data)     : offlineCreate({ url: '/paychecks/schedules', cacheKey: 'paycheckSchedules', data });
export const updatePaycheckSchedule = (id, data)  => isDemo() ? demo.updatePaycheckSchedule(id, data) : offlineUpdate({ url: `/paychecks/schedules/${id}`, cacheKey: 'paycheckSchedules', id, data });
export const deletePaycheckSchedule = (id)        => isDemo() ? demo.deletePaycheckSchedule(id)       : offlineDelete({ url: `/paychecks/schedules/${id}`, cacheKey: 'paycheckSchedules', id });
export const getPaychecks           = ()          => isDemo() ? demo.getPaychecks()                   : cachedGet('paychecks', () => client.get('/paychecks/'));
export const updatePaycheckAmount   = (id, data)  => isDemo() ? demo.updatePaycheckAmount(id, data)   : client.patch(`/paychecks/${id}`, data);
export const getSpendableSurplus    = ()          => isDemo() ? demo.getSpendableSurplus()            : cachedGet('spendableSurplus', () => client.get('/paychecks/spendable-surplus'));
export const getEstimatedSavings    = ()          => isDemo() ? demo.getEstimatedSavings()            : cachedGet('estimatedSavings', () => client.get('/paychecks/savings'));
export const getBalanceAnchor       = ()          => isDemo() ? demo.getBalanceAnchor()               : cachedGet('balanceAnchor', () => client.get('/paychecks/balance'));
export const setBalanceAnchor       = (data)      => isDemo() ? demo.setBalanceAnchor(data)           : client.put('/paychecks/balance', data);
export const getRunningBalance      = ()          => isDemo() ? demo.getRunningBalance()              : cachedGet('runningBalance', () => client.get('/paychecks/running-balance'));
export const getSpendingReserve     = ()          => isDemo() ? demo.getSpendingReserve()              : cachedGet('spendingReserve', () => client.get('/paychecks/reserve'));
export const setSpendingReserve     = (data)      => isDemo() ? demo.setSpendingReserve(data)          : client.patch('/paychecks/reserve', data);
