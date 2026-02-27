/**
 * Offline query documents - merged with Firebase in queryRegistry.
 * Each doc has json (raw GQL response) + body (for extractDataFromResponse parsing).
 */
import PrimaryStockOffline from './PrimaryStockOffline';

const offlineDocs = {
  [PrimaryStockOffline.id]: PrimaryStockOffline,
};

export default offlineDocs;
