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
// getUpcomingRecurringPayments is a server-computed projection, not a stored
// list - nothing to optimistically merge into, so it's read-only cached.
// confirmRecurringPayment/skipRecurringPayment are compound actions against
// that projection, not row CRUD - left network-only, same reasoning as
// convertTransactionToTipDeposit in transactions.js.

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getRecurringPayments        = ()         => isDemo() ? demo.getRecurringPayments()              : cachedGet('recurringPayments', () => client.get('/recurring-payments/'));
export const createRecurringPayment      = (data)     => isDemo() ? demo.createRecurringPayment(data)        : offlineCreate({ url: '/recurring-payments/', cacheKey: 'recurringPayments', data });
export const updateRecurringPayment      = (id, data) => isDemo() ? demo.updateRecurringPayment(id, data)    : offlineUpdate({ url: `/recurring-payments/${id}`, cacheKey: 'recurringPayments', id, data });
export const deleteRecurringPayment      = (id)       => isDemo() ? demo.deleteRecurringPayment(id)          : offlineDelete({ url: `/recurring-payments/${id}`, cacheKey: 'recurringPayments', id });
export const getUpcomingRecurringPayments = ()        => isDemo() ? demo.getUpcomingRecurringPayments()      : cachedGet('upcomingRecurring', () => client.get('/recurring-payments/upcoming'));
export const confirmRecurringPayment      = (id, data) => isDemo() ? demo.confirmRecurringPayment(id, data)  : client.post(`/recurring-payments/${id}/confirm`, data);
export const skipRecurringPayment         = (id)       => isDemo() ? demo.skipRecurringPayment(id)           : client.post(`/recurring-payments/${id}/skip`);
