import {configured,respond,allow} from "../../lib/nexus-pos-server.js";
export default function handler(req,res){
 if(!allow(req,res,["GET"]))return;
 return respond(res,configured()?200:503,{status:configured()?"configured":"configuration_required",mode:"development",paymentProcessing:false});
}
