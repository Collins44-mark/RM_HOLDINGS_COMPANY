import re

with open('src/components/farm/FarmTractorsPage.tsx') as f:
    content = f.read()

old = '                <TractorDrawer selected={selected} drawerTab={drawerTab} setDrawerTab={setDrawerTab} />'
new = '''                <TractorDrawer selected={selected} drawerTab={drawerTab} setDrawerTab={setDrawerTab} editForm={drawerEditForm} onEditFormChange={(k:number,v:string)=>setDrawerEditForm({...drawerEditForm,[k]:v})} busy={drawerBusy} error={drawerError} savedOk={drawerSavedOk} onCancel={()=>{setDrawerEditForm({});setDrawerTab("overview");setDrawerSavedOk(false);setDrawerError(null);}} onSave={async()=>{setDrawerBusy(true);setDrawerError(null);setDrawerSavedOk(false);const res=await saveFarmTractorAction({id:selected?.id||"",code:selected?.code||"",name:drawerEditForm.name||selected?.name||"",registrationNumber:drawerEditForm.registrationNumber||selected?.registrationNumber||"",manufacturer:drawerEditForm.manufacturer||selected?.manufacturer||"",model:drawerEditForm.model||selected?.model||"",acquiredOn:drawerEditForm.acquiredOn||selected?.acquiredOn||"",acquisitionCost:drawerEditForm.acquisitionCost||selected?.acquisitionCost||"",status:drawerEditForm.status||selected?.status||"AVAILABLE",hourMeter:drawerEditForm.hourMeter||selected?.hourMeter||"0",notes:drawerEditForm.notes||selected?.notes||""});setDrawerBusy(false);if(res.ok){const refresh=await loadFarmTractorsWorkspaceAction();if(refresh.ok){setWorkspace(refresh.workspace);const updated=refresh.workspace.tractors.find((t:any)=>t.id===selected?.id||t.code===selected?.code);if(updated)setSelected(updated);}setDrawerSavedOk(true);setDrawerError(null);}else{setDrawerError(res.error||"Save failed");}}} />'''

content = content.replace(old, new)
with open('src/components/farm/FarmTractorsPage.tsx', 'w') as f:
    f.write(content)
