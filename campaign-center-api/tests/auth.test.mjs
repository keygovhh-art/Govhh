import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {generateKeyPair,exportJWK,SignJWT} from "jose";
import {buildTokenVerifier} from "../src/auth.mjs";

test("cryptographic login rejects forged, expired and wrong-audience accounts",async()=>{
  const keys=await generateKeyPair("RS256",{extractable:true});
  const otherKeys=await generateKeyPair("RS256",{extractable:true});
  const jwk=await exportJWK(keys.publicKey);
  Object.assign(jwk,{kid:"campaign-staging-test",use:"sig",alg:"RS256"});
  const jwks=createServer((_req,res)=>{
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify({keys:[jwk]}));
  }).listen(0,"127.0.0.1");
  const jwksUrl="http://127.0.0.1:"+jwks.address().port+"/keys";
  const issuer="http://127.0.0.1:"+jwks.address().port;
  const verify=buildTokenVerifier({issuer,audience:"gavhah-campaign-center",jwksUrl});
  const make=async(key,aud,expires="5m")=>
    new SignJWT({scope:"user"}).setProtectedHeader({alg:"RS256",kid:"campaign-staging-test"})
      .setSubject("member-two").setIssuer(issuer).setAudience(aud)
      .setIssuedAt().setExpirationTime(expires).sign(key);
  try{
    const valid=await make(keys.privateKey,"gavhah-campaign-center");
    assert.equal((await verify("Bearer "+valid)).sub,"member-two");
    await assert.rejects(verify(null),/Authentication required/);
    await assert.rejects(verify("Bearer "+await make(otherKeys.privateKey,"gavhah-campaign-center")));
    await assert.rejects(verify("Bearer "+await make(keys.privateKey,"another-app")));
    await assert.rejects(verify("Bearer "+await make(keys.privateKey,"gavhah-campaign-center","-1h")));
  }finally{await new Promise(resolve=>jwks.close(resolve))}
});
