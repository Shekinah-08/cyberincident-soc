import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { store, appendAudit } from '../db.js';
import { auth } from '../middleware.js';
const router=express.Router();
router.post('/login',(req,res)=>{const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');const u=store.userByEmail(email);if(!u||!u.active||!bcrypt.compareSync(password,u.password_hash))return res.status(401).json({error:'Identifiants incorrects'});const token=jwt.sign({sub:u.id,role:u.role},process.env.JWT_SECRET,{expiresIn:'8h'});appendAudit(u.id,'LOGIN','USER',u.id,{email:u.email});res.json({token,user:{id:u.id,name:u.name,email:u.email,role:u.role}});});
router.get('/me',auth,(req,res)=>res.json({user:req.user}));
export default router;
