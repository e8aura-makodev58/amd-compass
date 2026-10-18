import {expect,test} from '@playwright/test';
const room='/api/control-rooms/plant-1';
async function createShortfall(request){
 await request.post(`${room}/mode`,{data:{mode:'LIVE'}});await request.post(`${room}/reset`);await request.post(`${room}/simulation/pause`);
 for(let i=0;i<8;i++)await request.post(`${room}/simulation/force-event`);
 await request.post(`${room}/simulation/speed`,{data:{speed:1}});await request.post(`${room}/simulation/resume`);
 await expect.poll(async()=>{
   const s=await (await request.get(`${room}/state`)).json();return s.workforceContinuity.staffingRecommendations.some((r)=>r.status==='PENDING');
 },{timeout:15000}).toBe(true);
 await request.post(`${room}/simulation/pause`);
}
for(const width of [375,1280])test(`Staffing approval and rejection use real API with provider failure at ${width}px`,async({page,request})=>{
 await createShortfall(request);await page.setViewportSize({width,height:900});await page.goto('/rooms/plant-1');
 const tile=page.locator('#staffing-tile');await expect(tile.getByRole('heading',{name:/Staffing recommendation ready/})).toBeVisible();
 await tile.getByRole('button',{name:'Approve top option'}).click();await expect(tile.getByText('Approved by central command',{exact:true}).first()).toBeVisible();
 const state=await (await request.get(`${room}/state`)).json();expect(state.workforceContinuity.staffingRecommendations.some((r)=>r.status==='APPROVED_TOP')).toBe(true);
 await createShortfall(request);await page.reload();await expect(tile.getByRole('button',{name:'Reject',exact:true})).toBeVisible();
 await tile.locator('[data-staffing-reason]').fill('Hold coverage for central review');
 await page.waitForTimeout(1700);await expect(tile.locator('[data-staffing-reason]')).toHaveValue('Hold coverage for central review');
 await tile.getByRole('button',{name:'Reject',exact:true}).click();await expect(tile.getByText('Rejected',{exact:true}).first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#settings-tab').click();await page.locator('#settings-demo-tab').click();
 await page.locator('#staffing-policy').selectOption('AUTO_APPROVE_TOP');await page.locator('#staffing-policy-save').click();
 await expect.poll(async()=> (await (await request.get(`${room}/state`)).json()).workforceContinuity.staffingApproval).toBe('AUTO_APPROVE_TOP');
 const final=await (await request.get(`${room}/state`)).json();expect(final.workforceContinuity.staffingRecommendations.find((r)=>r.status==='REJECTED').reason).toBe('Hold coverage for central review');
});
test('staffing display fits a wall screen and retains central command controls',async({page,request})=>{
 await createShortfall(request);await page.setViewportSize({width:1920,height:1080});await page.goto('/rooms/plant-1/display/staffing');
 await expect(page.locator('#floor')).toBeHidden();await expect(page.locator('#staffing-tile')).toBeVisible();await expect(page.getByRole('button',{name:'Approve alternative'})).toBeVisible();
 await page.getByText(/Ranked options and evidence/).click();await expect(page.locator('#staffing-tile table').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
