/**
 * @fileoverview Passport-gated validation strategy for Snapshot. 
 * This implementation integrates with the Gitcoin API to validate 
 * whether a user is authorized to vote on a proposal. 
 * 
 * Last modified: May 4, 2023
 * 
 * NOTE: The original code used the Passport SDK to check if the user
 * has a valid passport. With the Passport API, we can simply check if
 * the user has a valid passport by looking for a score.
 * 
 * In this function, we are returning a boolean depending on a weighted
 * threshold score between 0-100 that indicates how likely it is that a
 * passport is owned by an honest user.
 * 
 */

// TODO: Run code in Snapshot playground
// TODO: Test API endpoints

// FIXME: Currently calls locally stored environment variables

import snapshot from '@snapshot-labs/snapshot.js';
import { ethers} from 'ethers';
import fetch from 'cross-fetch';

// these lines read the API key and scorer ID from the .env.local file
const API_KEY = process.env.NEXT_PUBLIC_GC_API_KEY
const SCORER_ID = process.env.NEXT_PUBLIC_GC_SCORER_ID

// endpoint for getting the signing message
const SIGNING_MESSAGE_URI = 'https://api.scorer.gitcoin.co/registry/signing-message'
// score needed to see hidden message
const THRESHOLD_NUMBER = 20

const headers = API_KEY ? ({
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY
}) : undefined

// enable wallet interactions
declare global {
  interface Window{
    ethereum?: any
  }
}

export default class extends Validation {
  public id = 'passport-gated';
  public github = 'snapshot-labs';
  public version = '0.1.0';
  public title = 'Gitcoin Passport Gated';
  public description =
    'Protect your proposals from spam and vote manipulation by requiring users to have a Gitcoin Passport.';

   //function returns  
  async validate(): Promise<boolean> {
    const requiredStamps = this.params.stamps;
    const passport: any = await getPassport(this.author);
    if (!passport) return false;
    if (!passport.stamps?.length || !requiredStamps?.length) return false;

    const verifiedStamps: any[] = await getVerifiedStamps(
      passport,
      this.author,
      requiredStamps.map((stamp) => ({
        id: stamp
      }))
    );
    if (!verifiedStamps.length) return false;

    const provider = snapshot.utils.getProvider(this.network);
    const proposalTs = (await provider.getBlock(this.snapshot)).timestamp;
    const operator = this.params.operator;

    // check issuance and expiration
    const validStamps = verifiedStamps
      .filter((stamp) =>
        hasValidIssuanceAndExpiration(stamp.credential, proposalTs)
      )
      .map((stamp) => stamp.provider);

    // console.log('validStamps', validStamps);
    // console.log('requiredStamps', requiredStamps);
    // console.log('operator', operator);

    if (operator === 'AND') {
      return requiredStamps.every((stamp) => validStamps.includes(stamp));
    } else if (operator === 'OR') {
      return requiredStamps.some((stamp) => validStamps.includes(stamp));
    } else {
      return false;
    }
  }
}
