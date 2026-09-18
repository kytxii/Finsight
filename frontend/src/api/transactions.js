import client from './client'
import * as demo from './demoStore'
import { cachedGet } from './offline/cache'
import { offlineCreate, offlineUpdate, offlineDelete } from './offline/mutate'


// GET endpoints read through the offline cache (#204): last-known response is
// returned immediately and refreshed underneath, so a cold-starting or
// unreachable backend doesn't leave the UI on skeletons.
//
// create/update/delete are offline-capable too (#204 phase 3, pilot
// resource): each tries the network first, and only queues to the outbox if
// that attempt fails for an unreachable reason - a real rejection (bad
// category, missing field, ...) still surfaces to the caller exactly as
// before. convertTransactionToTipDeposit is not wired - it's a compound
// operation (delete one row, create another elsewhere) that offlineCreate/
// offlineUpdate/offlineDelete don't model, and is rare enough to just fail
// offline for now.

const isDemo = () => localStorage.getItem('demo') === 'true'

// The backend now bounds this endpoint at 1000 rows (#110, previously
// unbounded) - request the ceiling explicitly so today's dashboards, which
// still fetch once and derive everything client-side, see no behavior
// change. Actually paginating what the dashboards request is a separate,
// larger follow-up (auditing every derived total/chart for partial-data
// correctness), not done here.
export const getTransactions    = ()         => isDemo() ? demo.getTransactions()           : cachedGet('transactions', () => client.get('/transactions/', { params: { limit: 1000 } }))
export const createTransaction  = (data)     => isDemo() ? demo.createTransaction(data)     : offlineCreate({ url: '/transactions/', cacheKey: 'transactions', data })
export const updateTransaction  = (id, data) => isDemo() ? demo.updateTransaction(id, data) : offlineUpdate({ url: `/transactions/${id}`, cacheKey: 'transactions', id, data })
export const deleteTransaction  = (id)       => isDemo() ? demo.deleteTransaction(id)       : offlineDelete({ url: `/transactions/${id}`, cacheKey: 'transactions', id })
export const convertTransactionToTipDeposit = (id) => isDemo() ? demo.convertTransactionToTipDeposit(id) : client.post(`/transactions/${id}/convert-to-tip-deposit`)
