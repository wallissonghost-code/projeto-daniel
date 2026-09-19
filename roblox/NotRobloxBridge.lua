-- NOT Roblox Bridge v1
-- Coloque este ModuleScript em ServerScriptService. HttpService deve estar habilitado.
local HttpService = game:GetService("HttpService")

local Bridge = {}
Bridge.__index = Bridge

function Bridge.new(config)
	assert(type(config) == "table", "config obrigatoria")
	assert(type(config.endpoint) == "string", "endpoint obrigatorio")
	assert(type(config.code) == "string", "code obrigatorio")
	assert(type(config.licenseSession) == "function", "licenseSession deve ser function")
	local self=setmetatable({},Bridge)
	self.endpoint=config.endpoint:gsub("/+$","")
	self.code=config.code
	self.gameId=config.gameId or tostring(game.GameId)
	self.serverId=config.serverId or game.JobId
	self.licenseSession=config.licenseSession
	self.cursor=0
	self.running=false
	self.interval=math.max(2,tonumber(config.interval) or 3)
	self.handlers={}
	return self
end

function Bridge:on(action,handler)
	assert(type(action)=="string" and type(handler)=="function","action/handler invalidos")
	self.handlers[action]=handler
	return self
end

function Bridge:_post(path,payload)
	payload.code=self.code
	payload.gameId=self.gameId
	payload.serverId=self.serverId
	payload.licenseSession=self.licenseSession()
	local response=HttpService:RequestAsync({
		Url=self.endpoint..path,
		Method="POST",
		Headers={["Content-Type"]="application/json"},
		Body=HttpService:JSONEncode(payload)
	})
	if not response.Success then return nil,response.StatusCode..": "..response.Body end
	return HttpService:JSONDecode(response.Body)
end

function Bridge:poll()
	local data,err=self:_post("/roblox/poll",{cursor=self.cursor})
	if not data or not data.ok then return false,err or (data and data.reason) or "bridge_error" end
	for _,item in ipairs(data.commands or {}) do
		self.cursor=math.max(self.cursor,tonumber(item.cursor) or self.cursor)
		local command=item.command or {}
		local handler=self.handlers[tostring(command.action or "")]
		if handler then task.spawn(handler,command.params or {},command) end
	end
	self.cursor=math.max(self.cursor,tonumber(data.cursor) or self.cursor)
	return true,data
end

function Bridge:start()
	if self.running then return end
	self.running=true
	task.spawn(function()
		while self.running do
			local ok,err=self:poll()
			if not ok then warn("[NOT Roblox Bridge]",err) end
			task.wait(self.interval)
		end
	end)
end

function Bridge:stop()
	self.running=false
	pcall(function() self:_post("/roblox/leave",{}) end)
end

return Bridge
