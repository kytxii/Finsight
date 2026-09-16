import client from './client';
import * as demo from './demoStore'
import { cachedGet } from './offline/cache';


// GET endpoints read through the offline cache (#204): last-known response is
// returned immediately and refreshed underneath, so a cold-starting or
// unreachable backend doesn't leave the UI on skeletons. Mutations are
// untouched here - they still go straight to the network, and client.js drops
// the cache on every successful write.

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getRecurringPayments        = ()         => isDemo() ? demo.getRecurringPayments()              : cachedGet('recurringPayments', () => client.get('/recurring-payments/'));
export const createRecurringPayment      = (data)     => isDemo() ? demo.createRecurringPayment(data)        : client.post('/recurring-payments/', data);
export const updateRecurringPayment      = (id, data) => isDemo() ? demo.updateRecurringPayment(id, data)    : client.patch(`/recurring-payments/${id}`, data);
export const deleteRecurringPayment      = (id)       => isDemo() ? demo.deleteRecurringPayment(id)          : client.delete(`/recurring-payments/${id}`);
export const getUpcomingRecurringPayments = ()        => isDemo() ? demo.getUpcomingRecurringPayments()      : cachedGet('upcomingRecurring', () => client.get('/recurring-payments/upcoming'));
export const confirmRecurringPayment      = (id, data) => isDemo() ? demo.confirmRecurringPayment(id, data)  : client.post(`/recurring-payments/${id}/confirm`, data);
export const skipRecurringPayment         = (id)       => isDemo() ? demo.skipRecurringPayment(id)           : client.post(`/recurring-payments/${id}/skip`);
