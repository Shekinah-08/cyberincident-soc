import jwt from 'jsonwebtoken';
import { store } from './db.js';
export function auth(req,res,next){
  const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):null;
  if(!token)return res.status(401).json({error:'Authentification requise'});
  try{const payload=jwt.verify(token,process.env.JWT_SECRET);const u=store.userById(payload.sub);if(!u||!u.active)return res.status(401).json({error:'Compte invalide ou désactivé'});req.user={id:u.id,name:u.name,email:u.email,role:u.role,active:u.active,created_at:u.created_at};next();}
  catch{return res.status(401).json({error:'Jeton invalide ou expiré'});}
}
export const allow=(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'Accès refusé pour ce rôle'});
export function notFound(req,res){res.status(404).json({error:'Ressource introuvable'});}
export function errorHandler(err,req,res,next){console.error(err);if(err.code==='LIMIT_FILE_SIZE')return res.status(413).json({error:'Fichier trop volumineux'});res.status(err.status||500).json({error:err.message||'Erreur interne du serveur'});}
