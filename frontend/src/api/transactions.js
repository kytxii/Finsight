import client from './client'
import * as demo from './demoStore'
import { cachedGet } from './offline/cache'


// GET endpoints read through the offline cache (#204): last-known response is
// returned immediately and refreshed underneath, so a cold-starting or
// unreachable backend doesn't leave the UI on skeletons. Mutations are
// untouched here - they still go straight to the network, and client.js drops
// the cache on every successful write.

const isDemo = () => localStorage.getItem('demo') === 'true'

// The backend now bounds this endpoint at 1000 rows (#110, previously
// unbounded) - request the ceiling explicitly so today's dashboards, which
// still fetch once and derive everything client-side, see no behavior
// change. Actually paginating what the dashboards request is a separate,
// larger follow-up (auditing every derived total/chart for partial-data
// correctness), not done here.
export const getTransactions    = ()         => isDemo() ? demo.getTransactions()           : cachedGet('transactions', () => client.get('/transactions/', { params: { limit: 1000 } }))
export const createTransaction  = (data)     => isDemo() ? demo.createTransaction(data)     : client.post('/transactions/', data)
export const updateTransaction  = (id, data) => isDemo() ? demo.updateTransaction(id, data) : client.patch(`/transactions/${id}`, data)
export const deleteTransaction  = (id)       => isDemo() ? demo.deleteTransaction(id)       : client.delete(`/transactions/${id}`)
export const convertTransactionToTipDeposit = (id) => isDemo() ? demo.convertTransactionToTipDeposit(id) : client.post(`/transactions/${id}/convert-to-tip-deposit`)
