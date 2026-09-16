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
// getCashOnHand is a server-computed aggregate, not a stored row - read-only
// cached. convertTipDepositToTransaction is a compound action (deletes this,
// creates a transaction elsewhere) - left network-only.

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getTipDeposits   = ()     => isDemo() ? demo.getTipDeposits()        : cachedGet('tipDeposits', () => client.get('/tip-deposits/'));
export const createTipDeposit = (data)   => isDemo() ? demo.createTipDeposit(data)     : offlineCreate({ url: '/tip-deposits/', cacheKey: 'tipDeposits', data });
export const updateTipDeposit = (id, data) => isDemo() ? demo.updateTipDeposit(id, data) : offlineUpdate({ url: `/tip-deposits/${id}`, cacheKey: 'tipDeposits', id, data });
export const deleteTipDeposit = (id)     => isDemo() ? demo.deleteTipDeposit(id)       : offlineDelete({ url: `/tip-deposits/${id}`, cacheKey: 'tipDeposits', id });
export const getCashOnHand    = (year, month) => isDemo() ? demo.getCashOnHand(year, month) : cachedGet(`cashOnHand:${year}-${month}`, () => client.get('/tip-deposits/cash-on-hand', { params: { year, month } }));
export const convertTipDepositToTransaction = (id) => isDemo() ? demo.convertTipDepositToTransaction(id) : client.post(`/tip-deposits/${id}/convert-to-transaction`);
