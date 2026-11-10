import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import ModerationPanel from "@/components/ModerationPanel";
export const dynamic="force-dynamic";
export default async function ModeratorPage(){
 const user=await currentUser();
 if(!user?.verified || !user.moderator || user.account_state!=="active")redirect("/");
 return <ModerationPanel/>;
}
