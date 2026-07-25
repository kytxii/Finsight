import client from './client';
import * as demo from './demoStore';

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getPaycheckSchedules   = ()          => isDemo() ? demo.getPaycheckSchedules()           : client.get('/paychecks/schedules');
export const createPaycheckSchedule = (data)      => isDemo() ? demo.createPaycheckSchedule(data)     : client.post('/paychecks/schedules', data);
export const updatePaycheckSchedule = (id, data)  => isDemo() ? demo.updatePaycheckSchedule(id, data) : client.patch(`/paychecks/schedules/${id}`, data);
export const deletePaycheckSchedule = (id)        => isDemo() ? demo.deletePaycheckSchedule(id)       : client.delete(`/paychecks/schedules/${id}`);
export const getPaychecks           = ()          => isDemo() ? demo.getPaychecks()                   : client.get('/paychecks/');
export const updatePaycheckAmount   = (id, data)  => isDemo() ? demo.updatePaycheckAmount(id, data)   : client.patch(`/paychecks/${id}`, data);
export const getSpendableSurplus    = ()          => isDemo() ? demo.getSpendableSurplus()            : client.get('/paychecks/spendable-surplus');
export const getEstimatedSavings    = ()          => isDemo() ? demo.getEstimatedSavings()            : client.get('/paychecks/savings');
export const getBalanceAnchor       = ()          => isDemo() ? demo.getBalanceAnchor()               : client.get('/paychecks/balance');
export const setBalanceAnchor       = (data)      => isDemo() ? demo.setBalanceAnchor(data)           : client.put('/paychecks/balance', data);
export const getRunningBalance      = ()          => isDemo() ? demo.getRunningBalance()              : client.get('/paychecks/running-balance');
export const getSpendingReserve     = ()          => isDemo() ? demo.getSpendingReserve()              : client.get('/paychecks/reserve');
export const setSpendingReserve     = (data)      => isDemo() ? demo.setSpendingReserve(data)          : client.patch('/paychecks/reserve', data);
