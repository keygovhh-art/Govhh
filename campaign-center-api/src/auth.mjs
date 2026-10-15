import { createRemoteJWKSet, jwtVerify } from "jose";

export function buildTokenVerifier({issuer,audience,jwksUrl}){
  if(!issuer||!audience||!jwksUrl)
    throw Error("Missing CC_JWT_ISSUER, CC_JWT_AUDIENCE or CC_JWKS_URL");
  const issuerUrl=new URL(issuer),jwks=new URL(jwksUrl);
  if(!["https:","http:"].includes(issuerUrl.protocol)||!["https:","http:"].includes(jwks.protocol))
    throw Error("Invalid issuer or JWKS URL");
  const local=(url)=>["localhost","127.0.0.1","::1"].includes(url.hostname);
  if((issuerUrl.protocol!=="https:"&&!local(issuerUrl))||
     (jwks.protocol!=="https:"&&!local(jwks)))throw Error("HTTPS required for external issuer and JWKS");
  // Never trust token-provided jwks, jku, kid URL or arbitrary claims.
  const keys=createRemoteJWKSet(jwks);
  return async function verifyBearer(authorization){
    if(typeof authorization!=="string"||!/^Bearer [^ ]+$/.test(authorization)){
      const err=Error("Authentication required");err.status=401;throw err;
    }
    const {payload}=await jwtVerify(authorization.slice(7),keys,{
      issuer,audience,algorithms:["RS256","ES256"],clockTolerance:10,
    });
    const sub=payload.sub;
    if(typeof sub!=="string"||sub.length<3||sub.length>200){
      const err=Error("Invalid account identity");err.status=401;throw err;
    }
    return {sub};
  };
}
