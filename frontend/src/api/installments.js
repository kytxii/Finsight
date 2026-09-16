import client from './client';
import * as demo from './demoStore';
import { cachedGet } from './offline/cache';
import { offlineCreate, offlineUpdate, offlineDelete } from './offline/mutate';
import { computeMonthlyPayment } from '../utils/installmentMath';



// GET endpoints read through the offline cache (#204): last-known response is
// returned immediately and refreshed underneath, so a cold-starting or
// unreachable backend doesn't leave the UI on skeletons.
//
// create/update/delete are offline-capable too, same pattern as
// api/transactions.js: try the network, queue + apply optimistically only on
// an unreachable-shaped failure.
//
// getInstallmentInsights is a server-computed gauge, not a stored row -
// read-only cached.
//
// InstallmentsPanel/MobileInstallments render row.monthly_payment directly
// from the create/update response (not just from a re-fetch), so the
// optimistic offline shape has to compute it the same way the backend does
// (installment_service.create_installment) - otherwise every stat on a
// freshly offline-created installment shows blank until the queued write
// actually lands.

const isDemo = () => localStorage.getItem('demo') === 'true';

export const getInstallments        = ()         => isDemo() ? demo.getInstallments()          : cachedGet('installments', () => client.get('/installments/'));
const withComputedInstallmentFields = (fields) => ({
  category: 'DEBT', // backend hardcodes this - never client-settable
  active: true,
  payments_made: 0,
  ...fields,
  monthly_payment: fields.period_months ? computeMonthlyPayment(fields.total_amount, fields.period_months) : null,
});

export const createInstallment      = (data)     => isDemo() ? demo.createInstallment(data)     : offlineCreate({ url: '/installments/', cacheKey: 'installments', data, toListItem: withComputedInstallmentFields });
export const updateInstallment      = (id, data) => isDemo() ? demo.updateInstallment(id, data)  : offlineUpdate({ url: `/installments/${id}`, cacheKey: 'installments', id, data, deriveMerge: (item, data) => withComputedInstallmentFields({ ...item, ...data }) });
export const deleteInstallment      = (id)       => isDemo() ? demo.deleteInstallment(id)        : offlineDelete({ url: `/installments/${id}`, cacheKey: 'installments', id });
export const getInstallmentInsights = (id)       => isDemo() ? demo.getInstallmentInsights(id)   : cachedGet(`installmentInsights:${id}`, () => client.get(`/installments/${id}/insights`));
