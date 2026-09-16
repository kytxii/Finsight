import client from './client';
import * as demo from './demoStore';
import { cachedGet } from './offline/cache';


// GET endpoints read through the offline cache (#204): last-known response is
// returned immediately and refreshed underneath, so a cold-starting or
// unreachable backend doesn't leave the UI on skeletons. Mutations are
// untouched here - they still go straight to the network, and client.js drops
// the cache on every successful write.

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getInstallments        = ()         => isDemo() ? demo.getInstallments()          : cachedGet('installments', () => client.get('/installments/'));
export const createInstallment      = (data)     => isDemo() ? demo.createInstallment(data)     : client.post('/installments/', data);
export const updateInstallment      = (id, data) => isDemo() ? demo.updateInstallment(id, data)  : client.patch(`/installments/${id}`, data);
export const deleteInstallment      = (id)       => isDemo() ? demo.deleteInstallment(id)        : client.delete(`/installments/${id}`);
export const getInstallmentInsights = (id)       => isDemo() ? demo.getInstallmentInsights(id)   : cachedGet(`installmentInsights:${id}`, () => client.get(`/installments/${id}/insights`));
