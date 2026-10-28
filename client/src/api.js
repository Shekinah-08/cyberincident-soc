const API='/api';
export async function api(path,{method='GET',body,token,formData=false}={}){
  const headers={}; if(token) headers.Authorization=`Bearer ${token}`; if(!formData) headers['Content-Type']='application/json';
  const res=await fetch(API+path,{method,headers,body:formData?body:body?JSON.stringify(body):undefined});
  if(!res.ok){let e; try{e=await res.json()}catch{e={error:res.statusText}}; if(res.status===401&&token){localStorage.removeItem('cyber_session');window.dispatchEvent(new Event('cyber:logout'))} throw new Error(e.error||'Erreur serveur')}
  const type=res.headers.get('content-type')||''; return type.includes('application/json')?res.json():res.blob();
}
