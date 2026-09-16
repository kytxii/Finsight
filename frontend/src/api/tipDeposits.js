import client from './client';
import * as demo from './demoStore'
import { cachedGet } from './offline/cache';


// GET endpoints read through the offline cache (#204): last-known response is
// returned immediately and refreshed underneath, so a cold-starting or
// unreachable backend doesn't leave the UI on skeletons. Mutations are
// untouched here - they still go straight to the network, and client.js drops
// the cache on every successful write.

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getTipDeposits   = ()     => isDemo() ? demo.getTipDeposits()        : cachedGet('tipDeposits', () => client.get('/tip-deposits/'));
export const createTipDeposit = (data)   => isDemo() ? demo.createTipDeposit(data)     : client.post('/tip-deposits/', data);
export const updateTipDeposit = (id, data) => isDemo() ? demo.updateTipDeposit(id, data) : client.patch(`/tip-deposits/${id}`, data);
export const deleteTipDeposit = (id)     => isDemo() ? demo.deleteTipDeposit(id)       : client.delete(`/tip-deposits/${id}`);
export const getCashOnHand    = (year, month) => isDemo() ? demo.getCashOnHand(year, month) : cachedGet(`cashOnHand:${year}-${month}`, () => client.get('/tip-deposits/cash-on-hand', { params: { year, month } }));
export const convertTipDepositToTransaction = (id) => isDemo() ? demo.convertTipDepositToTransaction(id) : client.post(`/tip-deposits/${id}/convert-to-transaction`);
