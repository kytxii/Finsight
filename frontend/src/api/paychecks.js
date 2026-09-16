import client from './client';
import * as demo from './demoStore'
import { cachedGet } from './offline/cache';


// GET endpoints read through the offline cache (#204): last-known response is
// returned immediately and refreshed underneath, so a cold-starting or
// unreachable backend doesn't leave the UI on skeletons. Mutations are
// untouched here - they still go straight to the network, and client.js drops
// the cache on every successful write.

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getPaycheckSchedules   = ()          => isDemo() ? demo.getPaycheckSchedules()           : cachedGet('paycheckSchedules', () => client.get('/paychecks/schedules'));
export const createPaycheckSchedule = (data)      => isDemo() ? demo.createPaycheckSchedule(data)     : client.post('/paychecks/schedules', data);
export const updatePaycheckSchedule = (id, data)  => isDemo() ? demo.updatePaycheckSchedule(id, data) : client.patch(`/paychecks/schedules/${id}`, data);
export const deletePaycheckSchedule = (id)        => isDemo() ? demo.deletePaycheckSchedule(id)       : client.delete(`/paychecks/schedules/${id}`);
export const getPaychecks           = ()          => isDemo() ? demo.getPaychecks()                   : cachedGet('paychecks', () => client.get('/paychecks/'));
export const updatePaycheckAmount   = (id, data)  => isDemo() ? demo.updatePaycheckAmount(id, data)   : client.patch(`/paychecks/${id}`, data);
export const getSpendableSurplus    = ()          => isDemo() ? demo.getSpendableSurplus()            : cachedGet('spendableSurplus', () => client.get('/paychecks/spendable-surplus'));
export const getEstimatedSavings    = ()          => isDemo() ? demo.getEstimatedSavings()            : cachedGet('estimatedSavings', () => client.get('/paychecks/savings'));
export const getBalanceAnchor       = ()          => isDemo() ? demo.getBalanceAnchor()               : cachedGet('balanceAnchor', () => client.get('/paychecks/balance'));
export const setBalanceAnchor       = (data)      => isDemo() ? demo.setBalanceAnchor(data)           : client.put('/paychecks/balance', data);
export const getRunningBalance      = ()          => isDemo() ? demo.getRunningBalance()              : cachedGet('runningBalance', () => client.get('/paychecks/running-balance'));
export const getSpendingReserve     = ()          => isDemo() ? demo.getSpendingReserve()              : cachedGet('spendingReserve', () => client.get('/paychecks/reserve'));
export const setSpendingReserve     = (data)      => isDemo() ? demo.setSpendingReserve(data)          : client.patch('/paychecks/reserve', data);
